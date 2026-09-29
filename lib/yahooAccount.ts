import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshYahooTokens, YahooAuthError, type YahooTokens } from "@/lib/providers/yahoo";

export async function saveYahooTokens(supabase: SupabaseClient, userId: string, tokens: YahooTokens, redirectUri: string) {
  const { error } = await supabase.from("yahoo_accounts").upsert({
    user_id: userId,
    yahoo_guid: tokens.guid ?? null,
    access_token: encrypt(tokens.accessToken),
    refresh_token: encrypt(tokens.refreshToken),
    expires_at: tokens.expiresAt.toISOString(),
    redirect_uri: redirectUri,
  });
  if (error) throw new Error(error.message);
}

interface YahooRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  redirect_uri: string;
}

const stillValid = (expiresAt: string) => new Date(expiresAt).getTime() - Date.now() > 60_000;

// One refresh at a time per user on this server, so overlapping page refreshes don't race.
const refreshing = new Map<string, Promise<string>>();

// Returns a valid access token, refreshing it (Yahoo tokens last one hour) when needed.
export async function yahooAccessToken(supabase: SupabaseClient, row: YahooRow): Promise<string> {
  if (stillValid(row.expires_at)) return decrypt(row.access_token);

  const pending = refreshing.get(row.user_id);
  if (pending) return pending;
  const p = refresh(supabase, row).finally(() => refreshing.delete(row.user_id));
  refreshing.set(row.user_id, p);
  return p;
}

async function refresh(supabase: SupabaseClient, row: YahooRow): Promise<string> {
  const oldRefresh = decrypt(row.refresh_token);
  try {
    const tokens = await refreshYahooTokens(oldRefresh, row.redirect_uri);
    await supabase
      .from("yahoo_accounts")
      .update({
        access_token: encrypt(tokens.accessToken),
        refresh_token: encrypt(tokens.refreshToken || oldRefresh),
        expires_at: tokens.expiresAt.toISOString(),
      })
      .eq("user_id", row.user_id);
    return tokens.accessToken;
  } catch (e) {
    // Another request (maybe on another server) may have just refreshed it; use that if so.
    const { data: latest } = await supabase
      .from("yahoo_accounts")
      .select("access_token, expires_at")
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (latest && stillValid(latest.expires_at)) return decrypt(latest.access_token);
    console.error("Yahoo token refresh failed:", e);
    throw new YahooAuthError("Your Yahoo connection expired. On My leagues, click Remove under Yahoo, then Connect Yahoo again.");
  }
}
