export type Platform = "sleeper" | "espn" | "yahoo";

export interface Side {
  teamName: string;
  ownerName?: string;
  score: number;
  projected?: number;
}

export interface Matchup {
  id: string;
  platform: Platform;
  leagueName: string;
  week: number;
  me: Side;
  opponent: Side | null; // null = bye week
  url: string;
}

export interface MatchupsResponse {
  season: string;
  week: number;
  matchups: Matchup[];
  errors: { source: string; message: string }[];
}
