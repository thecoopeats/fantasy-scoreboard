import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { getEspnLeagueInfo, normalizeEspnS2, normalizeSwid, parseLeagueId } from "@/lib/providers/espn";
import { getNflState } from "@/lib/providers/sleeper";

export const dynamic = "force-dynamic";

// Final step of adding an ESPN league: save it with the chosen team (and encrypted cookies if private).
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const leagueId = parseLeagueId(String(body?.league ?? ""));
  const teamId = Number(body?.teamId);
  if (!leagueId) return NextResponse.json({ error: "Missing league." });
  if (!Number.isInteger(teamId)) return NextResponse.json({ error: "Pick your team." });
  const creds =
    body?.espnS2 && body?.swid ? { espnS2: normalizeEspnS2(body.espnS2), swid: normalizeSwid(body.swid) } : undefined;

  try {
    const { season } = await getNflState();
    const info = await getEspnLeagueInfo(leagueId, season, creds);
    const team = info.teams.find((t) => t.id === teamId);
    if (!team) return NextResponse.json({ error: "That team isn't in this league." });

    const { error } = await supabase.from("espn_leagues").upsert(
      {
        user_id: user.id,
        league_id: leagueId,
        league_name: info.name,
        team_id: team.id,
        team_name: team.name,
        espn_s2: creds ? encrypt(creds.espnS2) : null,
        swid: creds ? encrypt(creds.swid) : null,
      },
      { onConflict: "user_id,league_id" }
    );
    if (error) return NextResponse.json({ error: error.message });
    return NextResponse.json({ ok: true, message: `Added ${info.name} (${team.name}).` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't reach ESPN." });
  }
}
