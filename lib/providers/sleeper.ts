import type { Matchup } from "./types";

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

interface League { league_id: string; name: string }
interface Roster { roster_id: number; owner_id: string | null; co_owners?: string[] | null }
interface User { user_id: string; display_name: string; metadata?: { team_name?: string } }
interface SleeperMatchup { roster_id: number; matchup_id: number | null; points?: number | null }

export async function getSleeperMatchups(sleeperUserId: string, season: string, week: number): Promise<Matchup[]> {
  const leagues = await get<League[] | null>(`/user/${sleeperUserId}/leagues/nfl/${season}`, 600);

  const results = await Promise.all(
    (leagues ?? []).map(async (league): Promise<Matchup | null> => {
      const [rosters, users, matchups] = await Promise.all([
        get<Roster[]>(`/league/${league.league_id}/rosters`, 600),
        get<User[]>(`/league/${league.league_id}/users`, 600),
        get<SleeperMatchup[] | null>(`/league/${league.league_id}/matchups/${week}`, 30),
      ]);

      const myRoster = rosters.find((r) => r.owner_id === sleeperUserId || r.co_owners?.includes(sleeperUserId));
      if (!myRoster || !matchups) return null;
      const mine = matchups.find((m) => m.roster_id === myRoster.roster_id);
      if (!mine) return null;
      const opp =
        mine.matchup_id != null
          ? matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id)
          : undefined;

      const side = (m: SleeperMatchup) => {
        const roster = rosters.find((r) => r.roster_id === m.roster_id);
        const user = users.find((u) => u.user_id === roster?.owner_id);
        return {
          teamName: user?.metadata?.team_name || user?.display_name || `Team ${m.roster_id}`,
          ownerName: user?.display_name,
          score: m.points ?? 0,
        };
      };

      return {
        id: `sleeper-${league.league_id}-${week}`,
        platform: "sleeper",
        leagueName: league.name,
        week,
        me: side(mine),
        opponent: opp ? side(opp) : null,
        url: `https://sleeper.com/leagues/${league.league_id}/matchup`,
      };
    })
  );

  return results.filter((m): m is Matchup => m !== null);
}
