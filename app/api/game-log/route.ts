import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { getEspnGameLog } from "@/lib/providers/espn";
import { getNflState, getSleeperGameLog } from "@/lib/providers/sleeper";
import type { GameLog } from "@/lib/providers/types";
import { getYahooGameLog } from "@/lib/providers/yahoo";
import { yahooAccessToken } from "@/lib/yahooAccount";

export const dynamic = "force-dynamic";

// A player's week-by-week points in one of the user's leagues: ?platform=&leagueId=&playerId=&week=
export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const platform = q.get("platform");
  const leagueId = q.get("leagueId") ?? "";
  const playerId = q.get("playerId") ?? "";
  const requested = Number(q.get("week"));
  const week = Number.isInteger(requested) && requested >= 1 && requested <= 18 ? requested : 18;
  if (!leagueId || !/^[\w.-]+$/.test(playerId)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { season } = await getNflState();
  let log: GameLog;
  try {
    if (platform === "sleeper") {
      const { data: acct } = await supabase.from("sleeper_accounts").select("sleeper_user_id").maybeSingle();
      if (!acct) return NextResponse.json({ error: "not found" }, { status: 404 });
      log = await getSleeperGameLog(leagueId, season, playerId, week);
    } else if (platform === "espn") {
      const { data: row } = await supabase
        .from("espn_leagues")
        .select("league_id, espn_s2, swid")
        .eq("league_id", leagueId)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
      const creds = row.espn_s2 && row.swid ? { espnS2: decrypt(row.espn_s2), swid: decrypt(row.swid) } : undefined;
      log = await getEspnGameLog(leagueId, season, playerId, week, creds);
    } else if (platform === "yahoo") {
      const { data: yahoo } = await supabase.from("yahoo_accounts").select("*").maybeSingle();
      if (!yahoo) return NextResponse.json({ error: "not found" }, { status: 404 });
      log = await getYahooGameLog(await yahooAccessToken(supabase, yahoo), leagueId, season, playerId, week);
    } else {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load the game log." }, { status: 502 });
  }
  return NextResponse.json(log);
}
