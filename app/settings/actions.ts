"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { getEspnLeagueInfo } from "@/lib/providers/espn";
import { getNflState, lookupSleeperUser } from "@/lib/providers/sleeper";
import { exchangeYahooCode, parseYahooCode, yahooRedirectUri } from "@/lib/providers/yahoo";
import { saveYahooTokens } from "@/lib/yahooAccount";

function back(params: { ok?: string; error?: string }): never {
  revalidatePath("/settings");
  revalidatePath("/");
  redirect("/settings?" + new URLSearchParams(params as Record<string, string>).toString());
}

async function attempt<T>(fn: () => Promise<T>): Promise<[T, null] | [null, string]> {
  try {
    return [await fn(), null];
  } catch (e) {
    return [null, e instanceof Error ? e.message : "Something went wrong."];
  }
}

export async function saveSleeper(formData: FormData) {
  const { supabase, user } = await requireUser();
  const username = String(formData.get("username") ?? "").trim();
  if (!username) back({ error: "Enter your Sleeper username." });

  const [sleeperUser, err] = await attempt(() => lookupSleeperUser(username));
  if (err !== null) back({ error: err });
  if (!sleeperUser) back({ error: `No Sleeper user named "${username}".` });

  const { error } = await supabase.from("sleeper_accounts").upsert({
    user_id: user.id,
    username: sleeperUser.display_name || username,
    sleeper_user_id: sleeperUser.user_id,
  });
  if (error) back({ error: error.message });
  back({ ok: `Connected Sleeper account ${sleeperUser.display_name || username}.` });
}

export async function removeSleeper() {
  const { supabase, user } = await requireUser();
  await supabase.from("sleeper_accounts").delete().eq("user_id", user.id);
  back({ ok: "Removed your Sleeper account." });
}

export async function setEspnTeam(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const teamId = Number(formData.get("team_id"));

  const { data: row } = await supabase.from("espn_leagues").select("*").eq("id", id).maybeSingle();
  if (!row) back({ error: "League not found." });

  const creds = row.espn_s2 && row.swid ? { espnS2: decrypt(row.espn_s2), swid: decrypt(row.swid) } : undefined;
  const [state, stateErr] = await attempt(() => getNflState());
  if (stateErr !== null) back({ error: stateErr });
  const [info, err] = await attempt(() => getEspnLeagueInfo(row.league_id, state.season, creds));
  if (err !== null) back({ error: err });
  const team = info.teams.find((t) => t.id === teamId);
  if (!team) back({ error: "Pick a team from the list." });

  const { error } = await supabase
    .from("espn_leagues")
    .update({ team_id: team.id, team_name: team.name })
    .eq("id", id);
  if (error) back({ error: error.message });
  back({ ok: `You're ${team.name} in ${info.name}.` });
}

export async function removeEspnLeague(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("espn_leagues").delete().eq("id", String(formData.get("id") ?? ""));
  back({ ok: "Removed the ESPN league." });
}

export async function connectYahooCode(formData: FormData) {
  const { supabase, user } = await requireUser();
  const code = parseYahooCode(String(formData.get("code") ?? ""));
  if (!code) back({ error: "Paste the full address from your browser's address bar, or just the code." });

  const origin = (await headers()).get("origin") ?? "";
  const redirectUri = yahooRedirectUri(origin);
  const [, err] = await attempt(async () => {
    const tokens = await exchangeYahooCode(code, redirectUri);
    await saveYahooTokens(supabase, user.id, tokens, redirectUri);
  });
  if (err !== null) back({ error: `Yahoo: ${err}` });
  back({ ok: "Connected Yahoo. All your Yahoo leagues this season are included." });
}

export async function removeYahoo() {
  const { supabase, user } = await requireUser();
  await supabase.from("yahoo_accounts").delete().eq("user_id", user.id);
  back({ ok: "Removed your Yahoo account." });
}
