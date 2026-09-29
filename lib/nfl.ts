import type { GameState } from "@/lib/providers/types";

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
    status?: { type?: { state?: string } };
    competitions?: { competitors?: { team?: { abbreviation?: string } }[] }[];
  }[];
}

export type GameStates = Map<string, GameState>;

export async function getGameStates(season: string, week: number): Promise<GameStates> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const states: GameStates = new Map();
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return states;
    const data = (await res.json()) as Scoreboard;
    for (const e of data.events ?? []) {
      const s = e.status?.type?.state;
      const state: GameState = s === "post" ? "done" : s === "in" ? "live" : "upcoming";
      for (const c of e.competitions?.[0]?.competitors ?? []) {
        const abbr = c.team?.abbreviation;
        if (abbr) states.set(ESPN_ABBR_FIX[abbr] ?? abbr, state);
      }
    }
  } catch {
    // Game status is a nice-to-have; scores still work without it.
  }
  return states;
}

export function stateFor(states: GameStates, team?: string): GameState {
  if (!team) return "bye";
  return states.get(team) ?? (states.size ? "bye" : "upcoming");
}
