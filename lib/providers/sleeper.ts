import { unstable_cache } from "next/cache";
import { getGameStates, stateFor } from "@/lib/nfl";
import { progressOf, sortPlayers, toSide, type LeagueWeek, type Matchup, type PlayerLine, type TeamWeek } from "./types";

// Sleeper's public API: https://docs.sleeper.com (no auth required).
const BASE = "https://api.sleeper.app/v1";

async function get<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(BASE + path, { next: { revalidate } });
  if (!res.ok) throw new Error(`Sleeper returned ${res.status}`);
  return res.json() as Promise<T>;
}

export interface NflState {
  season: string;
  week: number;
  display_week: number;
}

export function getNflState() {
  return get<NflState>("/state/nfl", 600);
}

export function currentWeek(state: NflState) {
  return Math.min(18, Math.max(1, state.display_week || state.week || 1));
}

export function lookupSleeperUser(username: string) {
  return get<{ user_id: string; display_name: string } | null>(`/user/${encodeURIComponent(username)}`, 0);
}

// The full player directory is ~15 MB, so keep a trimmed copy (id -> [name, pos, team]) cached for 12 hours.
const getPlayers = unstable_cache(
  async () => {
    const res = await fetch(BASE + "/players/nfl", { cache: "no-store" });
    if (!res.ok) throw new Error(`Sleeper players returned ${res.status}`);
    const all = (await res.json()) as Record<
      string,
      { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null }
    >;
    const out: Record<string, [string, string, string]> = {};
    for (const [id, p] of Object.entries(all)) {
      const name = p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || id;
      out[id] = [name, p.position ?? "", p.team ?? ""];
    }
    return out;
  },
  ["sleeper-players-v1"],
  { revalidate: 43200 }
);

interface League { league_id: string; name: string }
interface Roster { roster_id: number; owner_id: string | null; co_owners?: string[] | null }
interface User { user_id: string; display_name: string; metadata?: { team_name?: string } }
interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points?: number | null;
  starters?: string[] | null;
  players?: string[] | null;
  players_points?: Record<string, number> | null;
}

export async function getSleeperLeagueWeek(leagueId: string, season: string, week: number): Promise<LeagueWeek> {
  const [league, rosters, users, matchups, players, states] = await Promise.all([
    get<League>(`/league/${leagueId}`, 600),
    get<Roster[]>(`/league/${leagueId}/rosters`, 600),
    get<User[]>(`/league/${leagueId}/users`, 600),
    get<SleeperMatchup[] | null>(`/league/${leagueId}/matchups/${week}`, 30),
    getPlayers(),
    getGameStates(season, week),
  ]);

  const teamWeek = (m: SleeperMatchup): TeamWeek => {
    const roster = rosters.find((r) => r.roster_id === m.roster_id);
    const user = users.find((u) => u.user_id === roster?.owner_id);
    const starters = (m.starters ?? []).filter((id) => id && id !== "0");
    const ids = [...new Set([...starters, ...(m.players ?? [])])]; // starters first, in lineup order
    const lines: PlayerLine[] = ids.map((id) => {
      const [name, pos, team] = players[id] ?? [id, "", ""];
      return {
        id,
        name,
        pos,
        nflTeam: team || undefined,
        points: m.players_points?.[id] ?? 0,
        starter: starters.includes(id),
        state: stateFor(states, team || undefined),
      };
    });
    return {
      key: String(m.roster_id),
      ownerIds: [roster?.owner_id, ...(roster?.co_owners ?? [])].filter((x): x is string => !!x),
      teamName: user?.metadata?.team_name || user?.display_name || `Team ${m.roster_id}`,
      ownerName: user?.display_name,
      score: m.points ?? 0,
      players: sortPlayers(lines),
      progress: progressOf(lines),
    };
  };

  const games: LeagueWeek["games"] = [];
  const byMatchup = new Map<number, SleeperMatchup[]>();
  for (const m of matchups ?? []) {
    if (m.matchup_id == null) games.push({ a: teamWeek(m), b: null });
    else byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m]);
  }
  for (const [, pair] of [...byMatchup].sort((x, y) => x[0] - y[0])) {
    games.push({ a: teamWeek(pair[0]), b: pair[1] ? teamWeek(pair[1]) : null });
  }

  return {
    platform: "sleeper",
    leagueId,
    leagueName: league.name,
    season,
    week,
    url: `https://sleeper.com/leagues/${leagueId}/matchup`,
    games,
  };
}

export async function getSleeperMatchups(sleeperUserId: string, season: string, week: number): Promise<Matchup[]> {
  const leagues = await get<League[] | null>(`/user/${sleeperUserId}/leagues/nfl/${season}`, 600);

  const results = await Promise.all(
    (leagues ?? []).map(async (league): Promise<Matchup | null> => {
      const lw = await getSleeperLeagueWeek(league.league_id, season, week);
      for (const g of lw.games) {
        const mine = [g.a, g.b].find((t) => t?.ownerIds.includes(sleeperUserId));
        if (!mine) continue;
        const opp = mine === g.a ? g.b : g.a;
        return {
          id: `sleeper-${league.league_id}-${week}`,
          platform: "sleeper",
          leagueName: lw.leagueName,
          week,
          me: toSide(mine),
          opponent: opp ? toSide(opp) : null,
          url: lw.url,
          leagueHref: `/league/sleeper/${league.league_id}?week=${week}`,
        };
      }
      return null;
    })
  );

  return results.filter((m): m is Matchup => m !== null);
}
