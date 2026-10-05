import { gameFor, getGameStates, paceOf } from "@/lib/nfl";
import { liveProjection, progressOf, sortPlayers, toSide, type LeagueWeek, type Matchup, type PlayerLine, type TeamWeek } from "./types";

// Yahoo Fantasy Sports API (official, OAuth 2.0):
// https://developer.yahoo.com/fantasysports/guide/
const AUTH = "https://api.login.yahoo.com/oauth2";
const API = "https://fantasysports.yahooapis.com/fantasy/v2";

export function yahooConfigured() {
  return !!(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET);
}

export function yahooRedirectUri(origin: string) {
  return process.env.YAHOO_REDIRECT_URI || `${origin}/auth/yahoo/callback`;
}

export function yahooAuthorizeUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "fspt-r", // Fantasy Sports, read-only
    state,
  });
  return `${AUTH}/request_auth?${params}`;
}

// Accepts a bare code or a whole pasted URL containing ?code=...
export function parseYahooCode(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/[?&]code=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  return /^[\w-]+$/.test(s) ? s : null;
}

export interface YahooTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  guid?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<YahooTokens> {
  const basic = Buffer.from(`${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${AUTH}/get_token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Yahoo login returned ${res.status}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000),
    guid: json.xoauth_yahoo_guid,
  };
}

export function exchangeYahooCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshYahooTokens(refreshToken: string, redirectUri: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, redirect_uri: redirectUri });
}

export class YahooAuthError extends Error {}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

// revalidate > 0 caches per access token (the Authorization header is part of the cache key).
async function yget(token: string, path: string, revalidate = 0): Promise<Json> {
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}format=json`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
  });
  if (res.status === 401) throw new YahooAuthError("Yahoo access expired. Reconnect Yahoo on the My leagues page.");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = "";
    try {
      detail = JSON.parse(body)?.error?.description ?? "";
    } catch {
      detail = body.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? body.slice(0, 200);
    }
    console.error(`Yahoo ${res.status} for ${path}:`, body.slice(0, 500));
    throw new Error(`Yahoo returned ${res.status}${detail ? `: ${detail.trim()}` : ""}`);
  }
  return res.json();
}

// Yahoo's JSON wraps things in arrays of single-key objects; flatten them into one object.
function merge(x: Json): Record<string, Json> {
  if (Array.isArray(x)) return x.reduce((acc, el) => Object.assign(acc, merge(el)), {});
  if (x && typeof x === "object") return x;
  return {};
}

// Every value stored under `key`, anywhere in the tree (not descending into matches).
function findAll(node: Json, key: string, out: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, key, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      else findAll(v, key, out);
    }
  }
  return out;
}

function num(v: Json): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Yahoo lineup slot -> Sleeper-style slot name
const SLOTS: Record<string, string> = {
  "W/R/T": "FLEX",
  "W/R": "WRRB_FLEX",
  "W/T": "REC_FLEX",
  "Q/W/R/T": "SUPER_FLEX",
  D: "IDP_FLEX",
};
const BENCH = new Set(["BN", "IR", "IR+", "NA"]);

interface YahooTeam {
  team_key: string;
  name?: string;
  url?: string;
  managers?: Json;
  team_points?: { total?: string };
  team_projected_points?: { total?: string };
  team_live_projected_points?: { total?: string };
}

// League keys and the user's team keys this season (cached 10 minutes per token).
async function getMyYahooTeams(token: string) {
  const [teamsJson, leaguesJson] = await Promise.all([
    yget(token, "/users;use_login=1/games;game_keys=nfl/teams", 600),
    yget(token, "/users;use_login=1/games;game_keys=nfl/leagues", 600),
  ]);
  const teamKeys = findAll(teamsJson, "team").map(merge).map((t) => String(t.team_key)).filter(Boolean);
  const leagues = findAll(leaguesJson, "league")
    .map(merge)
    .map((l) => ({ key: String(l.league_key), name: String(l.name ?? "Yahoo league"), url: l.url as string | undefined }));
  return { teamKeys: new Set(teamKeys), leagues };
}

type GameStates = Awaited<ReturnType<typeof getGameStates>>;

async function getRosterPlayers(token: string, teamKey: string, week: number, states: GameStates) {
  const json = await yget(token, `/team/${teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`);
  return parsePlayers(json, states);
}

// Available players (free agents + waivers) with the most points this week.
async function getAvailablePlayers(token: string, leagueKey: string, week: number, states: GameStates) {
  const json = await yget(
    token,
    `/league/${leagueKey}/players;status=A;sort=PTS;sort_type=week;sort_week=${week};count=25/stats;type=week;week=${week}`
  );
  return parsePlayers(json, states)
    .map((p) => ({ ...p, starter: false, slot: undefined }))
    .filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points);
}

function parsePlayers(json: Json, states: GameStates): PlayerLine[] {
  return findAll(json, "player").map((raw, i) => {
    const p = merge(raw);
    const slotRaw = String(merge(p.selected_position).position ?? "BN");
    const nflTeam = p.editorial_team_abbr ? String(p.editorial_team_abbr).toUpperCase() : undefined;
    const game = gameFor(states, nflTeam);
    const points = num(p.player_points?.total) ?? 0;
    const projected = num(p.player_projected_points?.total);
    return {
      id: String(p.player_key ?? `slot-${i}`),
      name: String(p.name?.full ?? "Unknown player"),
      pos: String(p.display_position ?? p.primary_position ?? ""),
      nflTeam,
      points,
      projected,
      pace: paceOf(points, projected, game),
      starter: !BENCH.has(slotRaw),
      slot: SLOTS[slotRaw] ?? slotRaw,
      state: game.state,
      fraction: game.fraction,
    };
  });
}

// Without live or player projections: current score plus the pregame projection scaled by
// how much of the starters' game time is still to be played.
function estimateLive(score: number, pregame: number | undefined, players: PlayerLine[]) {
  const starters = players.filter((p) => p.starter);
  if (pregame == null || !starters.length) return pregame;
  const remaining =
    starters.reduce((sum, p) => sum + (p.state === "upcoming" ? 1 : p.state === "live" ? 1 - (p.fraction ?? 0) : 0), 0) /
    starters.length;
  return Math.round((score + pregame * remaining) * 100) / 100;
}

// One league's week: every matchup from the scoreboard, plus rosters for the teams asked for.
export async function getYahooLeagueWeek(
  token: string,
  leagueKey: string,
  season: string,
  week: number,
  rosters: "all" | "mine" = "all"
): Promise<LeagueWeek & { myTeamKeys: Set<string> }> {
  const [scoreboard, mine, states] = await Promise.all([
    yget(token, `/league/${leagueKey}/scoreboard;week=${week}`),
    getMyYahooTeams(token),
    getGameStates(season, week),
  ]);
  const leagueMeta = merge(scoreboard?.fantasy_content?.league);

  const matchups = findAll(scoreboard, "matchup").map((m) =>
    findAll(m, "team").map((t) => merge(t) as unknown as YahooTeam)
  );

  // Rosters: everyone, or just the user's game.
  const wanted = new Set<string>();
  for (const teams of matchups) {
    if (rosters === "all" || teams.some((t) => mine.teamKeys.has(t.team_key))) teams.forEach((t) => wanted.add(t.team_key));
  }
  const [rosterEntries, freeAgents] = await Promise.all([
    Promise.all([...wanted].map(async (k) => [k, await getRosterPlayers(token, k, week, states).catch(() => [])] as const)),
    // The league page (all rosters) also lists the best available players.
    rosters === "all" ? getAvailablePlayers(token, leagueKey, week, states).catch(() => undefined) : undefined,
  ]);
  const rosterByTeam = new Map(rosterEntries);

  const teamWeek = (t: YahooTeam): TeamWeek => {
    const players = rosterByTeam.get(t.team_key) ?? [];
    const score = num(t.team_points?.total) ?? 0;
    return {
      key: t.team_key,
      ownerIds: mine.teamKeys.has(t.team_key) ? ["me"] : [],
      teamName: t.name ?? "Unknown team",
      ownerName: findAll(t.managers, "nickname")[0],
      score,
      projected:
        num(t.team_live_projected_points?.total) ?? // Yahoo's own live projection, when it sends one
        liveProjection(players) ?? // built from player projections
        estimateLive(score, num(t.team_projected_points?.total), players),
      players: sortPlayers(players),
      progress: players.length ? progressOf(players) : undefined,
    };
  };

  return {
    platform: "yahoo",
    leagueId: leagueKey,
    leagueName: String(leagueMeta.name ?? mine.leagues.find((l) => l.key === leagueKey)?.name ?? "Yahoo league"),
    season,
    week,
    url: String(leagueMeta.url ?? "https://football.fantasysports.yahoo.com/"),
    games: matchups.filter((ts) => ts.length).map((ts) => ({ a: teamWeek(ts[0]), b: ts[1] ? teamWeek(ts[1]) : null })),
    freeAgents,
    myTeamKeys: mine.teamKeys,
  };
}

export async function getYahooMatchups(token: string, season: string, week: number): Promise<Matchup[]> {
  const { leagues } = await getMyYahooTeams(token);
  const results = await Promise.all(
    leagues.map(async (league): Promise<Matchup | null> => {
      const lw = await getYahooLeagueWeek(token, league.key, season, week, "mine");
      for (const g of lw.games) {
        const mine = [g.a, g.b].find((t) => t && lw.myTeamKeys.has(t.key));
        if (!mine) continue;
        const opp = mine === g.a ? g.b : g.a;
        return {
          id: `yahoo-${mine.key}-${week}`,
          platform: "yahoo",
          leagueName: lw.leagueName,
          week,
          me: toSide(mine),
          opponent: opp ? toSide(opp) : null,
          url: lw.url,
          leagueHref: `/league/yahoo/${league.key}?week=${week}`,
        };
      }
      return null;
    })
  );
  return results.filter((m): m is Matchup => m !== null);
}

// TEMPORARY: raw samples + what the parser finds. Remove once Yahoo is confirmed working.
export async function debugYahoo(token: string, season: string, week: number) {
  const clip = (x: Json) => JSON.stringify(x).slice(0, 3000);
  const out: Record<string, Json> = { week };
  try {
    const mine = await getMyYahooTeams(token);
    out.myTeamKeys = [...mine.teamKeys];
    out.leagues = mine.leagues;
    const league = mine.leagues[0];
    if (league) {
      const sb = await yget(token, `/league/${league.key}/scoreboard;week=${week}`);
      out.yahooSendsLiveProjection = JSON.stringify(sb).includes("team_live_projected_points");
      out.scoreboardRaw = clip(sb);
      const myKey = [...mine.teamKeys].find((k) => k.startsWith(league.key + "."));
      if (myKey) out.rosterRaw = clip(await yget(token, `/team/${myKey}/roster;week=${week}/players/stats;type=week;week=${week}`));
      const lw = await getYahooLeagueWeek(token, league.key, season, week, "mine");
      out.parsed = {
        leagueName: lw.leagueName,
        games: lw.games.map((g) =>
          [g.a, g.b].filter(Boolean).map((t) => ({
            name: t!.teamName,
            mine: t!.ownerIds.includes("me"),
            score: t!.score,
            projected: t!.projected,
            progress: t!.progress,
            starters: t!.players.filter((p) => p.starter).map((p) => `${p.slot} ${p.name} ${p.nflTeam ?? ""} ${p.points}${p.projected != null ? `/${p.projected}` : ""} ${p.state}`),
          }))
        ),
      };
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}
