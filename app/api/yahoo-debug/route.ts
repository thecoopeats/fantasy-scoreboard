// TEMPORARY diagnostic for the Yahoo integration. Signed-in user's own data only; never returns tokens.
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { currentWeek, getNflState } from "@/lib/providers/sleeper";
import { debugYahoo } from "@/lib/providers/yahoo";
import { yahooAccessToken } from "@/lib/yahooAccount";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: yahoo } = await supabase.from("yahoo_accounts").select("*").maybeSingle();
  if (!yahoo) return NextResponse.json({ error: "No Yahoo account connected." });

  try {
    const token = await yahooAccessToken(supabase, yahoo);
    const state = await getNflState();
    return NextResponse.json(await debugYahoo(token, currentWeek(state)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
