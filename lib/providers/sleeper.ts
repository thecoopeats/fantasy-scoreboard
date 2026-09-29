import { unstable_cache } from "next/cache";
import { memo } from "@/lib/memo";
import { gameFor, getGameStates, paceOf } from "@/lib/nfl";
import { progressOf, sortPlayers, toSide, type LeagueWeek, type Matchup, type PlayerLine, type TeamWeek } from "./types";

// Sleeper's public API: https://docs.sleeper.com (no auth required).
const BASE = "https://api.sleeper.app/v1";

// revalidate = 0 means always fetch fresh (used for live scores).
async function get<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(BASE + path, revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" });
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
const getPlayers = memo(60 * 60 * 1000, unstable_cache(
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
));

// Projected stat lines per player (not documented by Sleeper, so failures just mean no projections).
const getProjectionStats = memo(15 * 60 * 1000, unstable_cache(
  async (season: string, week: number): Promise<Record<string, Record<string, number>>> => {
    const positions = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position%5B%5D=${p}`).join("&");
    try {
      const res = await fetch(
        `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${positions}`,
        { cache: "no-store" }
      );
      if (!res.ok) return {};
      const rows = (await res.json()) as { player_id?: string; stats?: Record<string, number> }[];
      const out: Record<string, Record<string, number>> = {};
      for (const r of rows ?? []) if (r.player_id && r.stats) out[r.player_id] = r.stats;
      return out;
    } catch {
      return {};
    }
  },
  ["sleeper-projections-v1"],
  { revalidate: 3600 }
));

// Score a projected stat line with the league's own scoring settings.
function projectedPoints(stats: Record<string, number> | undefined, scoring: Record<string, number>) {
  if (!stats) return undefined;
  let total = 0;
  for (const [stat, value] of Object.entries(scoring)) {
    if (typeof stats[stat] === "number") total += stats[stat] * value;
  }
  if (total === 0) {
    const rec = scoring.rec ?? 0;
    total = (rec >= 1 ? stats.pts_ppr : rec > 0 ? stats.pts_half_ppr : stats.pts_std) ?? 0;
  }
  return Math.round(total * 100) / 100;
}

interface League {
  league_id: string;
  name: string;
  scoring_settings?: Record<string, number>;
  roster_positions?: string[];
}
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
  const [league, rosters, users, matchups, players, states, projections] = await Promise.all([
    get<League>(`/league/${leagueId}`, 600),
    get<Roster[]>(`/league/${leagueId}/rosters`, 600),
    get<User[]>(`/league/${leagueId}/users`, 600),
    get<SleeperMatchup[] | null>(`/league/${leagueId}/matchups/${week}`, 0),
    getPlayers(),
    getGameStates(season, week),
    getProjectionStats(season, week),
  ]);
  const scoring = league.scoring_settings ?? {};

  const teamWeek = (m: SleeperMatchup): TeamWeek => {
    const roster = rosters.find((r) => r.roster_id === m.roster_id);
    const user = users.find((u) => u.user_id === roster?.owner_id);
    // starters[i] fills the league's roster_positions[i]; "0" marks an empty slot.
    const slotOf = new Map<string, string>();
    (m.starters ?? []).forEach((id, i) => {
      const slot = league.roster_positions?.[i];
      if (id && id !== "0" && slot) slotOf.set(id, slot);
    });
    const starters = (m.starters ?? []).filter((id) => id && id !== "0");
    const ids = [...new Set([...starters, ...(m.players ?? [])])]; // starters first, in lineup order
    const lines: PlayerLine[] = ids.map((id) => {
      const [name, pos, team] = players[id] ?? [id, "", ""];
      const game = gameFor(states, team || undefined);
      const points = m.players_points?.[id] ?? 0;
      const projected = projectedPoints(projections[id], scoring);
      return {
        id,
        name,
        pos,
        nflTeam: team || undefined,
        points,
        projected,
        pace: paceOf(points, projected, game),
        starter: starters.includes(id),
        slot: slotOf.get(id),
        state: game.state,
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
