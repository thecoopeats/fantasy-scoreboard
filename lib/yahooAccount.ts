import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshYahooTokens, type YahooTokens } from "@/lib/providers/yahoo";

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

// Returns a valid access token, refreshing it (Yahoo tokens last one hour) when needed.
export async function yahooAccessToken(supabase: SupabaseClient, row: YahooRow): Promise<string> {
  if (new Date(row.expires_at).getTime() - Date.now() > 60_000) return decrypt(row.access_token);

  const oldRefresh = decrypt(row.refresh_token);
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
}
