import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { anyLive, getGameStates } from "@/lib/nfl";
import { getEspnMatchup } from "@/lib/providers/espn";
import { currentWeek, getNflState, getSleeperMatchups } from "@/lib/providers/sleeper";
import type { Matchup, MatchupsResponse } from "@/lib/providers/types";
import { getYahooMatchups } from "@/lib/providers/yahoo";
import { yahooAccessToken } from "@/lib/yahooAccount";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getNflState();
  const requested = Number(request.nextUrl.searchParams.get("week"));
  const week = Number.isInteger(requested) && requested >= 1 && requested <= 18 ? requested : currentWeek(state);
  const season = state.season;

  const [{ data: sleeper }, { data: espn }, { data: yahoo }] = await Promise.all([
    supabase.from("sleeper_accounts").select("username, sleeper_user_id").maybeSingle(),
    supabase.from("espn_leagues").select("league_id, league_name, team_id, espn_s2, swid").not("team_id", "is", null),
    supabase.from("yahoo_accounts").select("*").maybeSingle(),
  ]);

  const tasks: { source: string; run: () => Promise<Matchup[]> }[] = [];

  if (yahoo) {
    tasks.push({
      source: "Yahoo",
      run: async () => getYahooMatchups(await yahooAccessToken(supabase, yahoo), week),
    });
  }

  if (sleeper) {
    tasks.push({
      source: "Sleeper",
      run: () => getSleeperMatchups(sleeper.sleeper_user_id, season, week),
    });
  }

  for (const row of espn ?? []) {
    tasks.push({
      source: `ESPN (${row.league_name ?? row.league_id})`,
      run: async () => {
        const creds = row.espn_s2 && row.swid ? { espnS2: decrypt(row.espn_s2), swid: decrypt(row.swid) } : undefined;
        const m = await getEspnMatchup(
          { leagueId: row.league_id, leagueName: row.league_name, teamId: row.team_id!, creds },
          season,
          week
        );
        return m ? [m] : [];
      },
    });
  }

  const [results, states] = await Promise.all([
    Promise.allSettled(tasks.map((t) => t.run())),
    getGameStates(season, week),
  ]);

  const body: MatchupsResponse = { season, week, live: anyLive(states), matchups: [], errors: [] };
  results.forEach((r, i) => {
    if (r.status === "fulfilled") body.matchups.push(...r.value);
    else body.errors.push({ source: tasks[i].source, message: r.reason?.message ?? "Unknown error" });
  });

  body.matchups.sort((a, b) => a.platform.localeCompare(b.platform) || a.leagueName.localeCompare(b.leagueName));
  return NextResponse.json(body);
}
