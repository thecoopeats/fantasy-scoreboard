import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { anyLive, getGameStates, REFRESH_IDLE_SECONDS, REFRESH_LIVE_SECONDS } from "@/lib/nfl";
import { getEspnLeagueWeek } from "@/lib/providers/espn";
import { currentWeek, getNflState, getSleeperLeagueWeek } from "@/lib/providers/sleeper";
import type { LeagueWeek, TeamWeek } from "@/lib/providers/types";
import { getYahooLeagueWeek } from "@/lib/providers/yahoo";
import { yahooAccessToken } from "@/lib/yahooAccount";
import AutoRefresh from "../../../components/AutoRefresh";
import Header from "../../../Header";
import LeagueView from "../../LeagueView";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string; leagueId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const { platform, leagueId } = await params;
  const state = await getNflState();
  const requested = Number((await searchParams).week);
  const week = Number.isInteger(requested) && requested >= 1 && requested <= 18 ? requested : currentWeek(state);

  let load: () => Promise<LeagueWeek>;
  let isMine: (t: TeamWeek) => boolean;

  if (platform === "sleeper") {
    const { data: acct } = await supabase.from("sleeper_accounts").select("sleeper_user_id").maybeSingle();
    if (!acct) notFound();
    load = () => getSleeperLeagueWeek(leagueId, state.season, week);
    isMine = (t) => t.ownerIds.includes(acct.sleeper_user_id);
  } else if (platform === "espn") {
    const { data: row } = await supabase
      .from("espn_leagues")
      .select("league_id, league_name, team_id, espn_s2, swid")
      .eq("league_id", leagueId)
      .maybeSingle();
    if (!row) notFound();
    const creds = row.espn_s2 && row.swid ? { espnS2: decrypt(row.espn_s2), swid: decrypt(row.swid) } : undefined;
    load = () => getEspnLeagueWeek({ leagueId, leagueName: row.league_name, creds }, state.season, week);
    isMine = (t) => row.team_id != null && t.key === String(row.team_id);
  } else if (platform === "yahoo") {
    const { data: yahoo } = await supabase.from("yahoo_accounts").select("*").maybeSingle();
    if (!yahoo) notFound();
    load = async () => getYahooLeagueWeek(await yahooAccessToken(supabase, yahoo), leagueId, state.season, week, "all");
    isMine = (t) => t.ownerIds.includes("me");
  } else {
    notFound();
  }

  let lw: LeagueWeek | null = null;
  let error: string | null = null;
  const [result, states] = await Promise.allSettled([load(), getGameStates(state.season, week)]);
  if (result.status === "fulfilled") lw = result.value;
  else error = result.reason instanceof Error ? result.reason.message : "Couldn't load this league.";
  const live = states.status === "fulfilled" && anyLive(states.value);

  return (
    <main className="container">
      <Header email={user.email} />
      <AutoRefresh seconds={live ? REFRESH_LIVE_SECONDS : REFRESH_IDLE_SECONDS} />
      <LeagueView platform={platform} leagueId={leagueId} week={week} lw={lw} error={error} isMine={isMine} />
    </main>
  );
}
