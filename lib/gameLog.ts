import type { GameLog, GameLogWeek } from "@/lib/providers/types";

// A team's regular-season schedule from ESPN's public site API: opponent and final score per week.
// Team abbreviations follow Sleeper's style (WAS, not WSH).

interface TeamSchedule {
  events?: {
    week?: { number?: number };
    competitions?: {
      status?: { type?: { completed?: boolean } };
      competitors?: {
        homeAway?: string;
        winner?: boolean;
        team?: { abbreviation?: string };
        score?: number | string | { value?: number; displayValue?: string };
      }[];
    }[];
  }[];
}

const TO_ESPN: Record<string, string> = { WAS: "WSH" };
const FROM_ESPN: Record<string, string> = { WSH: "WAS" };

export interface ScheduledGame {
  opponent: string; // "KC" or "@KC"
  result?: string; // "W 27-20"
}

function scoreOf(s: unknown): number | undefined {
  if (typeof s === "number") return s;
  if (typeof s === "string") return s === "" ? undefined : Number(s);
  if (s && typeof s === "object") {
    const o = s as { value?: number; displayValue?: string };
    return o.value ?? (o.displayValue ? Number(o.displayValue) : undefined);
  }
  return undefined;
}

export async function getTeamSchedule(team: string | undefined, season: string): Promise<Map<number, ScheduledGame>> {
  const out = new Map<number, ScheduledGame>();
  if (!team) return out;
  const abbr = (TO_ESPN[team] ?? team).toLowerCase();
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/schedule?season=${season}&seasontype=2`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return out;
    const data = (await res.json()) as TeamSchedule;
    for (const e of data.events ?? []) {
      const week = e.week?.number;
      const comp = e.competitions?.[0];
      const sides = comp?.competitors ?? [];
      const norm = (a?: string) => (a ? (FROM_ESPN[a] ?? a) : "");
      const me = sides.find((c) => norm(c.team?.abbreviation) === team);
      const opp = sides.find((c) => c !== me);
      if (!week || !me || !opp) continue;
      const opponent = `${me.homeAway === "away" ? "@" : ""}${norm(opp.team?.abbreviation)}`;
      let result: string | undefined;
      const mine = scoreOf(me.score);
      const theirs = scoreOf(opp.score);
      if (comp?.status?.type?.completed && mine != null && theirs != null) {
        result = `${mine > theirs ? "W" : mine < theirs ? "L" : "T"} ${mine}-${theirs}`;
      }
      out.set(week, { opponent, result });
    }
  } catch {
    // Opponents are a nice-to-have; points still show without them.
  }
  return out;
}

// Weeks 1..throughWeek, merging fantasy points with the NFL schedule. Weeks with no game are byes.
export function buildGameLog(
  throughWeek: number,
  points: Map<number, { points?: number; projected?: number; opponent?: string }>,
  schedule: Map<number, ScheduledGame>
): GameLog {
  const weeks: GameLogWeek[] = [];
  let total = 0;
  let gamesPlayed = 0;
  for (let w = 1; w <= throughWeek; w++) {
    const p = points.get(w);
    const game = schedule.get(w);
    const bye = schedule.size > 0 && !game;
    if (p?.points != null) {
      total += p.points;
      gamesPlayed++;
    }
    weeks.push({
      week: w,
      opponent: game?.opponent ?? p?.opponent,
      result: game?.result,
      bye: bye && p?.points == null ? true : undefined,
      points: p?.points,
      projected: p?.projected,
    });
  }
  return { weeks, total: Math.round(total * 100) / 100, gamesPlayed };
}
