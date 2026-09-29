import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { exchangeYahooCode, yahooRedirectUri } from "@/lib/providers/yahoo";
import { saveYahooTokens } from "@/lib/yahooAccount";

// Yahoo sends the user back here after they approve access.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(`${origin}/settings?${new URLSearchParams(params)}`);
    res.cookies.delete("yahoo_state");
    return res;
  };

  const { supabase, user } = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (searchParams.get("error")) return back({ error: "Yahoo connection was cancelled." });
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state || state !== request.cookies.get("yahoo_state")?.value) {
    return back({ error: "Yahoo connection expired. Please try again." });
  }

  try {
    const redirectUri = yahooRedirectUri(origin);
    const tokens = await exchangeYahooCode(code, redirectUri);
    await saveYahooTokens(supabase, user.id, tokens, redirectUri);
  } catch (e) {
    return back({ error: e instanceof Error ? e.message : "Couldn't connect Yahoo." });
  }
  return back({ ok: "Connected Yahoo. All your Yahoo leagues this season are included." });
}
