export type Platform = "sleeper" | "espn" | "yahoo";

// Where a player's NFL game stands this week. "bye" also covers free agents with no game.
export type GameState = "done" | "live" | "upcoming" | "bye";

// Points vs. projection so far, scaled to how much of the player's game has been played.
export type Pace = "over" | "under" | "even";

export interface PlayerLine {
  id: string;
  name: string;
  pos: string;
  nflTeam?: string;
  points: number;
  projected?: number;
  pace?: Pace;
  starter: boolean;
  state: GameState;
}

// Starters only.
export interface Progress {
  done: number;
  live: number;
  upcoming: number;
}

export interface Side {
  teamName: string;
  ownerName?: string;
  score: number;
  projected?: number;
  progress?: Progress;
  starters?: PlayerLine[];
}

export interface TeamWeek extends Omit<Side, "starters"> {
  key: string; // platform team/roster id
  ownerIds: string[];
  players: PlayerLine[];
}

export interface LeagueWeek {
  platform: Platform;
  leagueId: string;
  leagueName: string;
  season: string;
  week: number;
  url: string;
  games: { a: TeamWeek; b: TeamWeek | null }[];
}

export interface Matchup {
  id: string;
  platform: Platform;
  leagueName: string;
  week: number;
  me: Side;
  opponent: Side | null; // null = bye week
  url: string;
  leagueHref?: string; // this app's league page
}

export interface MatchupsResponse {
  season: string;
  week: number;
  live: boolean; // any NFL game in progress this week
  matchups: Matchup[];
  errors: { source: string; message: string }[];
}

export function progressOf(players: PlayerLine[]): Progress {
  const p = { done: 0, live: 0, upcoming: 0 };
  for (const pl of players) {
    if (!pl.starter) continue;
    if (pl.state === "live") p.live++;
    else if (pl.state === "upcoming") p.upcoming++;
    else p.done++;
  }
  return p;
}

export function toSide(t: TeamWeek): Side {
  return {
    teamName: t.teamName,
    ownerName: t.ownerName,
    score: t.score,
    projected: t.projected,
    progress: t.progress,
    starters: t.players.filter((p) => p.starter),
  };
}

// Starters in lineup order, then bench by points.
export function sortPlayers(players: PlayerLine[]): PlayerLine[] {
  const starters = players.filter((p) => p.starter);
  const bench = players.filter((p) => !p.starter).sort((a, b) => b.points - a.points);
  return [...starters, ...bench];
}
