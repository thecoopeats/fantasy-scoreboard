import { requireUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { getEspnLeagueInfo } from "@/lib/providers/espn";
import { getNflState } from "@/lib/providers/sleeper";
import { yahooConfigured } from "@/lib/providers/yahoo";
import Header from "../Header";
import {
  addEspnLeague,
  connectYahooCode,
  removeEspnLeague,
  removeSleeper,
  removeYahoo,
  saveSleeper,
  setEspnTeam,
} from "./actions";

interface EspnRow {
  id: string;
  league_id: string;
  league_name: string | null;
  team_id: number | null;
  team_name: string | null;
  espn_s2: string | null;
  swid: string | null;
}

async function TeamPicker({ row, season }: { row: EspnRow; season: string }) {
  let teams: { id: number; name: string; ownerName?: string }[] = [];
  let error: string | null = null;
  try {
    const creds = row.espn_s2 && row.swid ? { espnS2: decrypt(row.espn_s2), swid: decrypt(row.swid) } : undefined;
    teams = (await getEspnLeagueInfo(row.league_id, season, creds)).teams;
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load teams.";
  }
  if (error) return <div className="error">{error}</div>;

  return (
    <form action={setEspnTeam} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <input type="hidden" name="id" value={row.id} />
      <div style={{ flex: 1 }}>
        <label>Which team is yours?</label>
        <select name="team_id" required defaultValue="">
          <option value="" disabled>Select your team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.ownerName ? ` (${t.ownerName})` : ""}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" style={{ marginTop: 0 }}>Save</button>
    </form>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const { ok, error } = await searchParams;

  const [state, { data: sleeper }, { data: espn }, { data: yahoo }] = await Promise.all([
    getNflState(),
    supabase.from("sleeper_accounts").select("username").maybeSingle(),
    supabase.from("espn_leagues").select("*").order("created_at"),
    supabase.from("yahoo_accounts").select("user_id").maybeSingle(),
  ]);

  return (
    <main className="container">
      <Header email={user.email} />
      {ok && <div className="notice">{ok}</div>}
      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2><span className="badge sleeper">Sleeper</span>Account</h2>
        {sleeper ? (
          <div className="row">
            <span>Connected as <b>{sleeper.username}</b>. All your leagues this season are included.</span>
            <form action={removeSleeper}><button className="danger">Remove</button></form>
          </div>
        ) : (
          <form action={saveSleeper}>
            <label htmlFor="username">Sleeper username</label>
            <input id="username" name="username" required autoComplete="off" autoCapitalize="none" />
            <button type="submit">Connect Sleeper</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2><span className="badge espn">ESPN</span>Leagues</h2>
        {(espn as EspnRow[] | null)?.map((row) => (
          <div key={row.id} className="row" style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span>
                <b>{row.league_name ?? row.league_id}</b>
                {row.team_name && <span className="muted"> · {row.team_name}</span>}
                {row.espn_s2 && <span className="muted"> · private</span>}
              </span>
              <form action={removeEspnLeague}>
                <input type="hidden" name="id" value={row.id} />
                <button className="danger">Remove</button>
              </form>
            </div>
            {row.team_id == null && <TeamPicker row={row} season={state.season} />}
          </div>
        ))}

        <form action={addEspnLeague} style={{ marginTop: espn?.length ? 16 : 0 }}>
          <label htmlFor="league">League ID or league URL</label>
          <input id="league" name="league" required placeholder="e.g. 12345678 or https://fantasy.espn.com/football/league?leagueId=…" />
          <details>
            <summary>Private league? Add your ESPN cookies</summary>
            <ol>
              <li>On a computer, sign in at <a href="https://fantasy.espn.com" target="_blank" rel="noreferrer">fantasy.espn.com</a>.</li>
              <li>Press <code>F12</code> to open developer tools, then go to <b>Application</b> (Chrome/Edge) or <b>Storage</b> (Firefox) → <b>Cookies</b> → <code>https://fantasy.espn.com</code>.</li>
              <li>Copy the values of <code>espn_s2</code> and <code>SWID</code> into the boxes below.</li>
            </ol>
            <p className="muted">These are stored encrypted and only used to read your league. They act like your ESPN login, so only paste them here if you trust this site.</p>
            <label htmlFor="espn_s2">espn_s2</label>
            <input id="espn_s2" name="espn_s2" autoComplete="off" />
            <label htmlFor="swid">SWID</label>
            <input id="swid" name="swid" autoComplete="off" placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}" />
          </details>
          <button type="submit">Add ESPN league</button>
        </form>
      </section>

      <section className="card">
        <h2><span className="badge yahoo">Yahoo</span>Leagues</h2>
        {yahoo ? (
          <div className="row">
            <span>Connected. All your Yahoo leagues this season are included.</span>
            <form action={removeYahoo}><button className="danger">Remove</button></form>
          </div>
        ) : !yahooConfigured() ? (
          <p className="muted" style={{ margin: 0 }}>Yahoo isn&apos;t set up on this site yet.</p>
        ) : (
          <>
            <a className="button" href="/auth/yahoo/start" style={{ marginTop: 0 }}>Connect Yahoo</a>
            <details>
              <summary>Yahoo sent you to a page that won&apos;t load?</summary>
              <p className="muted">
                Copy the whole address from your browser&apos;s address bar (it contains <code>code=</code>) and paste it here.
              </p>
              <form action={connectYahooCode}>
                <input name="code" required autoComplete="off" placeholder="https://localhost:3000/auth/yahoo/callback?code=…" />
                <button type="submit">Finish connecting</button>
              </form>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
