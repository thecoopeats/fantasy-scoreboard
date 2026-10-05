import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { EspnAccessError, getEspnLeagueInfo, normalizeEspnS2, normalizeSwid, parseLeagueId } from "@/lib/providers/espn";
import { getNflState } from "@/lib/providers/sleeper";

export const dynamic = "force-dynamic";

// Step 1/2 of adding an ESPN league: is it public? Do these cookies work? Which team is theirs?
export async function POST(request: NextRequest) {
  const { user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const leagueId = parseLeagueId(String(body?.league ?? ""));
  if (!leagueId) {
    return NextResponse.json({
      error: "That doesn't look like an ESPN league link. It should contain leagueId= followed by numbers.",
    });
  }
  const creds =
    body?.espnS2 && body?.swid ? { espnS2: normalizeEspnS2(body.espnS2), swid: normalizeSwid(body.swid) } : undefined;

  try {
    const { season } = await getNflState();
    const info = await getEspnLeagueInfo(leagueId, season, creds);
    const myTeamId = creds ? info.teams.find((t) => t.owners.includes(creds.swid))?.id : undefined;
    return NextResponse.json({
      leagueId,
      name: info.name,
      teams: info.teams.map(({ id, name, ownerName }) => ({ id, name, ownerName })),
      myTeamId,
    });
  } catch (e) {
    if (e instanceof EspnAccessError) {
      return e.needsCreds
        ? NextResponse.json({ leagueId, private: true })
        : NextResponse.json({
            leagueId,
            credsRejected: true,
            error: "ESPN didn't accept those values. Double-check you copied the full espn_s2 and SWID while signed in to ESPN.",
          });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't reach ESPN." });
  }
}
