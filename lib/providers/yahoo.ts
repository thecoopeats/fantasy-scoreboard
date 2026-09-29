import type { Matchup } from "./types";

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

async function yget(token: string, path: string): Promise<Json> {
  const res = await fetch(`${API}${path}?format=json`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
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

// Yahoo "collections" look like { "0": { name: ... }, "1": { name: ... }, count: 2 }.
function items(coll: Json, name: string): Json[] {
  if (!coll || typeof coll !== "object") return [];
  const count = Number(coll.count ?? Object.keys(coll).filter((k) => /^\d+$/.test(k)).length);
  const out: Json[] = [];
  for (let i = 0; i < count; i++) {
    const v = coll[i]?.[name];
    if (v !== undefined) out.push(v);
  }
  return out;
}

function nflGame(json: Json) {
  const user = merge(items(json?.fantasy_content?.users, "user")[0]);
  return merge(items(user.games, "game")[0]);
}

function num(v: Json): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function getYahooMatchups(token: string, week: number): Promise<Matchup[]> {
  const [teamsJson, leaguesJson] = await Promise.all([
    yget(token, "/users;use_login=1/games;game_keys=nfl/teams"),
    yget(token, "/users;use_login=1/games;game_keys=nfl/leagues"),
  ]);

  const myTeams = items(nflGame(teamsJson).teams, "team").map(merge);
  const leagueNames = new Map<string, string>();
  for (const l of items(nflGame(leaguesJson).leagues, "league").map(merge)) {
    leagueNames.set(l.league_key, l.name);
  }

  const results = await Promise.all(
    myTeams.map(async (mine): Promise<Matchup | null> => {
      const teamKey: string = mine.team_key;
      const leagueKey = teamKey.split(".t.")[0];
      const json = await yget(token, `/team/${teamKey}/matchups;weeks=${week}`);
      const matchup = items(merge(json?.fantasy_content?.team).matchups, "matchup")[0];
      if (!matchup) return null;

      const teamsColl = matchup["0"]?.teams ?? merge(matchup).teams;
      const teams = items(teamsColl, "team").map(merge);
      const me = teams.find((t) => t.team_key === teamKey);
      const opp = teams.find((t) => t.team_key !== teamKey);
      if (!me) return null;

      const side = (t: Record<string, Json>) => ({
        teamName: t.name ?? "Unknown team",
        ownerName: t.managers?.[0]?.manager?.nickname,
        score: num(t.team_points?.total) ?? 0,
        projected: num(t.team_projected_points?.total),
      });

      return {
        id: `yahoo-${teamKey}-${week}`,
        platform: "yahoo",
        leagueName: leagueNames.get(leagueKey) ?? "Yahoo league",
        week,
        me: side(me),
        opponent: opp ? side(opp) : null,
        url: mine.url ?? "https://football.fantasysports.yahoo.com/",
      };
    })
  );

  return results.filter((m): m is Matchup => m !== null);
}
