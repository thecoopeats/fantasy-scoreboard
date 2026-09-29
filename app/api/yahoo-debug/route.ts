// TEMPORARY diagnostic for the Yahoo integration. Signed-in user's own data only; never returns tokens.
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { currentWeek, getNflState } from "@/lib/providers/sleeper";
import { debugYahoo, yahooRedirectUri } from "@/lib/providers/yahoo";
import { yahooAccessToken } from "@/lib/yahooAccount";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const id = process.env.YAHOO_CLIENT_ID ?? "";
  const config = {
    clientIdHint: id ? `${id.slice(0, 10)}…${id.slice(-4)} (${id.length} chars)` : "NOT SET",
    clientSecretSet: !!process.env.YAHOO_CLIENT_SECRET,
    redirectUri: yahooRedirectUri(request.nextUrl.origin),
  };

  const { data: yahoo } = await supabase.from("yahoo_accounts").select("*").maybeSingle();
  if (!yahoo) return NextResponse.json({ config, error: "No Yahoo account connected." });

  try {
    const token = await yahooAccessToken(supabase, yahoo);
    const state = await getNflState();
    return NextResponse.json({ config, connectedAt: yahoo.created_at, ...(await debugYahoo(token, currentWeek(state))) });
  } catch (e) {
    return NextResponse.json({ config, error: e instanceof Error ? e.message : String(e) });
  }
}
