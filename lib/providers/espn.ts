import type { Matchup } from "./types";

// ESPN has no official API; this is the same endpoint fantasy.espn.com uses.
// Public leagues work with just the league ID. Private leagues need the
// espn_s2 and SWID cookies from a logged-in browser.

export interface EspnCreds {
  espnS2: string;
  swid: string;
}

interface Team {
  id: number;
  name?: string;
  location?: string;
  nickname?: string;
  owners?: string[];
}
interface Member { id: string; displayName?: string; firstName?: string; lastName?: string }
interface ScheduleSide {
  teamId: number;
  totalPoints?: number;
  totalPointsLive?: number;
  totalProjectedPointsLive?: number;
}
interface Game { id: number; matchupPeriodId: number; home?: ScheduleSide; away?: ScheduleSide }
interface LeagueData {
  settings?: { name?: string };
  teams?: Team[];
  members?: Member[];
  schedule?: Game[];
}

export function normalizeSwid(swid: string) {
  const s = swid.trim();
  return s.startsWith("{") ? s : `{${s}}`;
}

export function parseLeagueId(input: string): string | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/leagueId=(\d+)/i);
  return m ? m[1] : null;
}

async function fetchLeague(leagueId: string, season: string, views: string[], creds?: EspnCreds, extra = "") {
  const qs = views.map((v) => `view=${v}`).join("&") + extra;
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${qs}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (creds) headers.Cookie = `espn_s2=${creds.espnS2}; SWID=${normalizeSwid(creds.swid)}`;

  // Private-league requests carry cookies, so never cache them.
  const res = await fetch(url, creds ? { headers, cache: "no-store" } : { headers, next: { revalidate: 30 } });
  if (res.status === 401) {
    throw new Error(
      creds
        ? "ESPN rejected your cookies. They may have expired. Re-add the league with fresh espn_s2 and SWID values."
        : "This ESPN league is private. Add your espn_s2 and SWID cookies to connect it."
    );
  }
  if (res.status === 404) throw new Error(`ESPN league ${leagueId} wasn't found for the ${season} season.`);
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  if (!res.headers.get("content-type")?.includes("json")) throw new Error("ESPN returned an unexpected response.");
  return (await res.json()) as LeagueData;
}

function teamName(t?: Team) {
  if (!t) return "Unknown team";
  return t.name || [t.location, t.nickname].filter(Boolean).join(" ") || `Team ${t.id}`;
}

function ownerName(data: LeagueData, t?: Team) {
  const m = data.members?.find((m) => m.id === t?.owners?.[0]);
  return m?.displayName || [m?.firstName, m?.lastName].filter(Boolean).join(" ") || undefined;
}

export async function getEspnLeagueInfo(leagueId: string, season: string, creds?: EspnCreds) {
  const data = await fetchLeague(leagueId, season, ["mSettings", "mTeam"], creds);
  return {
    name: data.settings?.name || `ESPN league ${leagueId}`,
    teams: (data.teams ?? []).map((t) => ({
      id: t.id,
      name: teamName(t),
      ownerName: ownerName(data, t),
      owners: (t.owners ?? []).map((o) => o.toUpperCase()),
    })),
  };
}

export async function getEspnMatchup(
  opts: { leagueId: string; leagueName?: string | null; teamId: number; creds?: EspnCreds },
  season: string,
  week: number
): Promise<Matchup | null> {
  const data = await fetchLeague(
    opts.leagueId,
    season,
    ["mSettings", "mTeam", "mMatchupScore", "mScoreboard"],
    opts.creds,
    `&scoringPeriodId=${week}`
  );

  const game = data.schedule?.find(
    (g) => g.matchupPeriodId === week && (g.home?.teamId === opts.teamId || g.away?.teamId === opts.teamId)
  );
  if (!game) return null;

  const isHome = game.home?.teamId === opts.teamId;
  const mySide = (isHome ? game.home : game.away)!;
  const oppSide = isHome ? game.away : game.home;

  const side = (s: ScheduleSide) => {
    const t = data.teams?.find((t) => t.id === s.teamId);
    return {
      teamName: teamName(t),
      ownerName: ownerName(data, t),
      score: s.totalPointsLive ?? s.totalPoints ?? 0,
      projected: s.totalProjectedPointsLive,
    };
  };

  return {
    id: `espn-${opts.leagueId}-${week}`,
    platform: "espn",
    leagueName: data.settings?.name || opts.leagueName || `ESPN league ${opts.leagueId}`,
    week,
    me: side(mySide),
    opponent: oppSide ? side(oppSide) : null,
    url: `https://fantasy.espn.com/football/boxscore?leagueId=${opts.leagueId}&matchupPeriodId=${week}&seasonId=${season}&teamId=${opts.teamId}`,
  };
}
