import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { yahooAuthorizeUrl, yahooConfigured, yahooRedirectUri } from "@/lib/providers/yahoo";

// "Connect Yahoo" button: sends the user to Yahoo to approve read access to their fantasy leagues.
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const { user } = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!yahooConfigured()) {
    return NextResponse.redirect(`${origin}/settings?error=${encodeURIComponent("Yahoo isn't set up on this site yet.")}`);
  }

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(yahooAuthorizeUrl(yahooRedirectUri(origin), state));
  response.cookies.set("yahoo_state", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/" });
  return response;
}
