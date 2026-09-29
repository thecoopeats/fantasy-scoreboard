import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { currentWeek, getNflState } from "@/lib/providers/sleeper";
import Dashboard from "./Dashboard";
import Header from "./Header";

export default async function Home() {
  const { supabase, user } = await requireUser();

  const [state, sleeper, espn, yahoo] = await Promise.all([
    getNflState(),
    supabase.from("sleeper_accounts").select("user_id", { count: "exact", head: true }),
    supabase.from("espn_leagues").select("id", { count: "exact", head: true }),
    supabase.from("yahoo_accounts").select("user_id", { count: "exact", head: true }),
  ]);
  const hasConnections = (sleeper.count ?? 0) + (espn.count ?? 0) + (yahoo.count ?? 0) > 0;

  return (
    <main className="container">
      <Header email={user.email} />
      {hasConnections ? (
        <Dashboard initialWeek={currentWeek(state)} />
      ) : (
        <div className="card empty">
          <h2>Welcome! Let&apos;s connect your leagues.</h2>
          <p className="muted">Add your Sleeper username and ESPN leagues to see all your matchups here.</p>
          <Link className="button" href="/settings">Connect leagues</Link>
        </div>
      )}
    </main>
  );
}
