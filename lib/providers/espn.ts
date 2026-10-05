import { ESPN_PRO_TEAMS, gameFor, getGameStates, paceOf } from "@/lib/nfl";
import {
  liveProjection,
  progressOf,
  sortPlayers,
  toSide,
  type LeagueWeek,
  type Matchup,
  type PlayerLine,
  type TeamWeek,
} from "./types";

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
interface RosterEntry {
  playerId?: number;
  lineupSlotId?: number;
  playerPoolEntry?: {
    id?: number;
    appliedStatTotal?: number;
    player?: {
      id?: number;
      fullName?: string;
      proTeamId?: number;
      defaultPositionId?: number;
      // statSourceId 0 = actual, 1 = projected; appliedTotal is in the league's scoring.
      stats?: { scoringPeriodId?: number; statSourceId?: number; appliedTotal?: number }[];
    };
  };
}
interface ScheduleSide {
  teamId: number;
  totalPoints?: number;
  totalPointsLive?: number;
  totalProjectedPointsLive?: number;
  rosterForCurrentScoringPeriod?: { entries?: RosterEntry[] };
}
interface Game { id: number; matchupPeriodId: number; home?: ScheduleSide; away?: ScheduleSide }
type EspnPlayer = NonNullable<NonNullable<RosterEntry["playerPoolEntry"]>["player"]>;
interface LeagueData {
  settings?: { name?: string };
  teams?: Team[];
  members?: Member[];
  schedule?: Game[];
  players?: { id?: number; onTeamId?: number; player?: EspnPlayer }[]; // kona_player_info view
}

const POSITIONS: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
const BENCH_SLOTS = new Set([20, 21]); // bench, IR
// ESPN lineupSlotId -> Sleeper-style slot name
const SLOTS: Record<number, string> = {
  0: "QB", 2: "RB", 3: "WRRB_FLEX", 4: "WR", 5: "REC_FLEX", 6: "TE", 7: "SUPER_FLEX", 16: "DEF", 17: "K", 23: "FLEX",
  8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S", 14: "DB", 15: "IDP_FLEX",
};

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

async function fetchLeague(
  leagueId: string,
  season: string,
  views: string[],
  creds?: EspnCreds,
  extra = "",
  filter?: object
) {
  const qs = views.map((v) => `view=${v}`).join("&") + extra;
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${qs}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (creds) headers.Cookie = `espn_s2=${creds.espnS2}; SWID=${normalizeSwid(creds.swid)}`;
  if (filter) headers["X-Fantasy-Filter"] = JSON.stringify(filter);

  // Always fresh: live scores, and private-league requests carry cookies.
  const res = await fetch(url, { headers, cache: "no-store" });
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

// Free agents and waiver players: the 200 most-owned, with this week's points (the best scorers are
// almost always among them). Same request espn.com's player list uses.
async function getEspnFreeAgents(leagueId: string, season: string, week: number, creds?: EspnCreds) {
  const data = await fetchLeague(leagueId, season, ["kona_player_info"], creds, `&scoringPeriodId=${week}`, {
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
      limit: 200,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
    },
  });
  return (data.players ?? []).filter((p) => !p.onTeamId);
}

export async function getEspnLeagueWeek(
  opts: { leagueId: string; leagueName?: string | null; creds?: EspnCreds; freeAgents?: boolean },
  season: string,
  week: number
): Promise<LeagueWeek> {
  const [data, states, faRaw] = await Promise.all([
    fetchLeague(
      opts.leagueId,
      season,
      ["mSettings", "mTeam", "mMatchupScore", "mScoreboard"],
      opts.creds,
      `&scoringPeriodId=${week}`,
      { schedule: { filterMatchupPeriodIds: { value: [week] } } }
    ),
    getGameStates(season, week),
    opts.freeAgents ? getEspnFreeAgents(opts.leagueId, season, week, opts.creds).catch(() => []) : Promise.resolve([]),
  ]);

  const freeAgents: PlayerLine[] | undefined = opts.freeAgents
    ? faRaw
        .map((fa, i): PlayerLine => {
          const p = fa.player;
          const nflTeam = p?.proTeamId ? ESPN_PRO_TEAMS[p.proTeamId] : undefined;
          const game = gameFor(states, nflTeam);
          const stat = (source: number) =>
            p?.stats?.find((s) => s.statSourceId === source && s.scoringPeriodId === week)?.appliedTotal;
          const points = stat(0) ?? 0;
          const projected = stat(1);
          return {
            id: String(fa.id ?? p?.id ?? `fa-${i}`),
            name: p?.fullName ?? "Unknown player",
            pos: POSITIONS[p?.defaultPositionId ?? 0] ?? "",
            nflTeam,
            points,
            projected,
            pace: paceOf(points, projected, game),
            starter: false,
            state: game.state,
            fraction: game.fraction,
          };
        })
        .filter((p) => p.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 25)
    : undefined;

  const teamWeek = (s: ScheduleSide): TeamWeek => {
    const t = data.teams?.find((t) => t.id === s.teamId);
    const players: PlayerLine[] = (s.rosterForCurrentScoringPeriod?.entries ?? []).map((e, i) => {
      const p = e.playerPoolEntry?.player;
      const nflTeam = p?.proTeamId ? ESPN_PRO_TEAMS[p.proTeamId] : undefined;
      const game = gameFor(states, nflTeam);
      const points = e.playerPoolEntry?.appliedStatTotal ?? 0;
      const projected = p?.stats?.find((s) => s.statSourceId === 1 && s.scoringPeriodId === week)?.appliedTotal;
      return {
        id: String(e.playerId ?? p?.id ?? e.playerPoolEntry?.id ?? `slot-${i}`),
        name: p?.fullName ?? "Unknown player",
        pos: POSITIONS[p?.defaultPositionId ?? 0] ?? "",
        nflTeam,
        points,
        projected,
        pace: paceOf(points, projected, game),
        starter: !BENCH_SLOTS.has(e.lineupSlotId ?? 20),
        slot: SLOTS[e.lineupSlotId ?? -1],
        state: game.state,
        fraction: game.fraction,
      };
    });
    return {
      key: String(s.teamId),
      ownerIds: (t?.owners ?? []).map((o) => o.toUpperCase()),
      teamName: teamName(t),
      ownerName: ownerName(data, t),
      score: s.totalPointsLive ?? s.totalPoints ?? 0,
      projected: s.totalProjectedPointsLive ?? liveProjection(players),
      players: sortPlayers(players),
      progress: players.length ? progressOf(players) : undefined,
    };
  };

  const games = (data.schedule ?? [])
    .filter((g) => g.matchupPeriodId === week && (g.home || g.away))
    .map((g) => {
      const a = teamWeek((g.home ?? g.away)!);
      const b = g.home && g.away ? teamWeek(g.away) : null;
      return { a, b };
    });

  return {
    platform: "espn",
    leagueId: opts.leagueId,
    leagueName: data.settings?.name || opts.leagueName || `ESPN league ${opts.leagueId}`,
    season,
    week,
    url: `https://fantasy.espn.com/football/league/scoreboard?leagueId=${opts.leagueId}&seasonId=${season}&matchupPeriodId=${week}`,
    games,
    freeAgents,
  };
}

export async function getEspnMatchup(
  opts: { leagueId: string; leagueName?: string | null; teamId: number; creds?: EspnCreds },
  season: string,
  week: number
): Promise<Matchup | null> {
  const lw = await getEspnLeagueWeek(opts, season, week);
  const key = String(opts.teamId);
  const game = lw.games.find((g) => g.a.key === key || g.b?.key === key);
  if (!game) return null;
  const mine = game.a.key === key ? game.a : game.b!;
  const opp = mine === game.a ? game.b : game.a;

  return {
    id: `espn-${opts.leagueId}-${week}`,
    platform: "espn",
    leagueName: lw.leagueName,
    week,
    me: toSide(mine),
    opponent: opp ? toSide(opp) : null,
    url: `https://fantasy.espn.com/football/boxscore?leagueId=${opts.leagueId}&matchupPeriodId=${week}&seasonId=${season}&teamId=${opts.teamId}`,
    leagueHref: `/league/espn/${opts.leagueId}?week=${week}`,
  };
}
