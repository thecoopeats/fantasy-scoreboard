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
  slot?: string; // lineup slot for starters, Sleeper-style: QB, RB, WR, TE, FLEX, SUPER_FLEX, K, DEF…
  state: GameState;
  fraction?: number; // share of the player's NFL game played, 0..1
}

// Team projection that updates during games: actual points for finished players, points plus the
// unplayed share of the projection for players mid-game, and the full projection for players yet to play.
export function liveProjection(players: PlayerLine[]): number | undefined {
  const starters = players.filter((p) => p.starter);
  if (!starters.some((p) => p.projected != null)) return undefined;
  let total = 0;
  for (const p of starters) {
    const proj = p.projected ?? 0;
    if (p.state === "upcoming") total += Math.max(p.points, proj);
    else if (p.state === "live") total += p.points + Math.max(0, proj * (1 - (p.fraction ?? 0)));
    else total += p.points;
  }
  return Math.round(total * 100) / 100;
}

// Lineup display order. Anything not listed (e.g. IDP slots) goes after DEF.
const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "WRRB_FLEX", "REC_FLEX", "SUPER_FLEX", "K", "DEF"];

const SLOT_LABELS: Record<string, string> = {
  FLEX: "FLEX",
  WRRB_FLEX: "FLEX",
  REC_FLEX: "FLEX",
  SUPER_FLEX: "SFLX",
  IDP_FLEX: "IDP",
};

export function slotLabel(slot?: string) {
  return slot ? (SLOT_LABELS[slot] ?? slot) : "";
}

function slotRank(slot?: string) {
  const i = slot ? SLOT_ORDER.indexOf(slot) : -1;
  return i === -1 ? SLOT_ORDER.length : i;
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
  freeAgents?: PlayerLine[]; // top-scoring players not on any team, when requested
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

// Starters as QB, RB, WR, TE, FLEX, K, DEF, then bench by points.
export function sortPlayers(players: PlayerLine[]): PlayerLine[] {
  const starters = players.filter((p) => p.starter).sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const bench = players.filter((p) => !p.starter).sort((a, b) => b.points - a.points);
  return [...starters, ...bench];
}
