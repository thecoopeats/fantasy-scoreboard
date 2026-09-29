import type { GameState, Pace } from "@/lib/providers/types";

// NFL game status per team, from ESPN's public scoreboard. Team abbreviations follow Sleeper's style (WAS, not WSH).

const ESPN_ABBR_FIX: Record<string, string> = { WSH: "WAS" };

// ESPN fantasy proTeamId -> abbreviation
export const ESPN_PRO_TEAMS: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN",
  11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
  21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX",
  33: "BAL", 34: "HOU",
};

interface Scoreboard {
  events?: {
    status?: { clock?: number; period?: number; type?: { state?: string } };
    competitions?: { competitors?: { team?: { abbreviation?: string } }[] }[];
  }[];
}

export interface TeamGame {
  state: GameState;
  fraction: number; // share of the game played, 0..1
}

export type GameStates = Map<string, TeamGame>;

const QUARTER = 15 * 60;

export async function getGameStates(season: string, week: number): Promise<GameStates> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const states: GameStates = new Map();
  try {
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) return states;
    const data = (await res.json()) as Scoreboard;
    for (const e of data.events ?? []) {
      const s = e.status?.type?.state;
      let game: TeamGame;
      if (s === "post") game = { state: "done", fraction: 1 };
      else if (s === "in") {
        const period = e.status?.period ?? 1;
        const played = period > 4 ? 4 * QUARTER : (period - 1) * QUARTER + (QUARTER - (e.status?.clock ?? QUARTER));
        game = { state: "live", fraction: Math.min(1, Math.max(0, played / (4 * QUARTER))) };
      } else game = { state: "upcoming", fraction: 0 };
      for (const c of e.competitions?.[0]?.competitors ?? []) {
        const abbr = c.team?.abbreviation;
        if (abbr) states.set(ESPN_ABBR_FIX[abbr] ?? abbr, game);
      }
    }
  } catch {
    // Game status is a nice-to-have; scores still work without it.
  }
  return states;
}

export function anyLive(states: GameStates) {
  for (const g of states.values()) if (g.state === "live") return true;
  return false;
}

// How often pages poll: fast while games are on, slow otherwise (keeps usage within Vercel's free plan).
export const REFRESH_LIVE_SECONDS = 15;
export const REFRESH_IDLE_SECONDS = 120;

export function gameFor(states: GameStates, team?: string): TeamGame {
  if (!team) return { state: "bye", fraction: 0 };
  return states.get(team) ?? (states.size ? { state: "bye", fraction: 0 } : { state: "upcoming", fraction: 0 });
}

// Is a player ahead of or behind his projection, given how much of his game has been played?
export function paceOf(points: number, projected: number | undefined, game: TeamGame): Pace | undefined {
  if (projected == null || projected <= 0) return undefined;
  if (game.state !== "live" && game.state !== "done") return undefined;
  const expected = projected * game.fraction;
  const margin = Math.max(1, expected * 0.1);
  if (points > expected + margin) return "over";
  if (points < expected - margin) return "under";
  return "even";
}
