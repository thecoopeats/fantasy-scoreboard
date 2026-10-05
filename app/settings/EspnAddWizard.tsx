"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ClipboardEvent } from "react";

interface Team { id: number; name: string; ownerName?: string }
interface CheckResult {
  leagueId?: string;
  name?: string;
  teams?: Team[];
  myTeamId?: number;
  private?: boolean;
  credsRejected?: boolean;
  error?: string;
}

const SWID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const swidOk = (s: string) => SWID_RE.test(s.trim().replace(/^["']|["']$/g, ""));
const s2Ok = (s: string) => /^\S{80,}$/.test(s.trim());

// Pull espn_s2 / SWID out of anything pasted: a bare value, "espn_s2=…; SWID=…", a copied cookie row…
function extractCookies(text: string): { espnS2?: string; swid?: string } {
  const s2 = text.match(/espn_s2["'\s:=]+([^;\s"']{80,})/i)?.[1];
  const swid = text.match(/\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?/i)?.[0];
  return { espnS2: s2, swid };
}

async function post(path: string, body: object): Promise<CheckResult & { ok?: boolean; message?: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { error: "Couldn't reach the site. Check your connection and try again." };
  }
}

type Browser = "chrome" | "firefox" | "safari";

const BROWSER_STEPS: Record<Browser, React.ReactNode[]> = {
  chrome: [
    <>Press <kbd>F12</kbd> (or right-click the page → <b>Inspect</b>).</>,
    <>Click the <b>Application</b> tab at the top. If you don&apos;t see it, click <b>»</b> to find it.</>,
    <>In the left panel, open <b>Cookies</b> → <b>https://fantasy.espn.com</b>.</>,
    <>Type <code>espn</code> in the <b>Filter</b> box. Click the <b>espn_s2</b> row and copy the <b>Cookie Value</b> shown below the list.</>,
    <>Clear the filter, type <code>SWID</code>, and copy its value the same way.</>,
  ],
  firefox: [
    <>Press <kbd>F12</kbd> (or right-click the page → <b>Inspect</b>).</>,
    <>Click the <b>Storage</b> tab at the top.</>,
    <>In the left panel, open <b>Cookies</b> → <b>https://fantasy.espn.com</b>.</>,
    <>Double-click the <b>Value</b> next to <b>espn_s2</b>, select all, and copy.</>,
    <>Do the same for <b>SWID</b>.</>,
  ],
  safari: [
    <>Turn on developer tools once: <b>Safari → Settings → Advanced</b> → check <b>Show features for web developers</b>.</>,
    <>Press <kbd>⌥ Option</kbd> + <kbd>⌘ Cmd</kbd> + <kbd>I</kbd> to open the Web Inspector.</>,
    <>Click the <b>Storage</b> tab, then <b>Cookies</b> → <b>fantasy.espn.com</b>.</>,
    <>Double-click the <b>Value</b> of <b>espn_s2</b> and copy it, then do the same for <b>SWID</b>.</>,
  ],
};

export default function EspnAddWizard() {
  const router = useRouter();
  const [step, setStep] = useState<"link" | "pick" | "private">("link");
  const [league, setLeague] = useState("");
  const [info, setInfo] = useState<CheckResult>({});
  const [teamId, setTeamId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [browser, setBrowser] = useState<Browser>("chrome");
  const [onPhone, setOnPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  useEffect(() => {
    setOnPhone(window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900);
    const ua = navigator.userAgent;
    if (/Firefox\//.test(ua)) setBrowser("firefox");
    else if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) setBrowser("safari");
  }, []);

  function reset() {
    setStep("link");
    setLeague("");
    setInfo({});
    setTeamId("");
    setEspnS2("");
    setSwid("");
    setError(undefined);
  }

  async function save(id: number | string, creds?: { espnS2: string; swid: string }) {
    const r = await post("/api/espn/add", { league: info.leagueId ?? league, teamId: Number(id), ...creds });
    if (r.ok) {
      reset();
      setSuccess(r.message);
      router.refresh();
    } else setError(r.error ?? "Something went wrong.");
  }

  async function checkLink() {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const r = await post("/api/espn/check", { league });
    setBusy(false);
    if (r.error) return setError(r.error);
    setInfo(r);
    setStep(r.private ? "private" : "pick");
  }

  async function connectPrivate() {
    setBusy(true);
    setError(undefined);
    const creds = { espnS2: espnS2.trim(), swid: swid.trim() };
    const r = await post("/api/espn/check", { league: info.leagueId ?? league, ...creds });
    if (r.error) {
      setBusy(false);
      return setError(r.error);
    }
    setInfo({ ...r, private: true });
    if (r.myTeamId != null) {
      await save(r.myTeamId, creds); // their team was recognized from their ESPN login
      setBusy(false);
    } else {
      setBusy(false);
      setStep("pick"); // couldn't tell which team is theirs; let them choose
    }
  }

  // Pasting something that contains both values fills both boxes.
  function smartPaste(e: ClipboardEvent<HTMLInputElement>) {
    const found = extractCookies(e.clipboardData.getData("text"));
    if (found.espnS2 && found.swid) {
      e.preventDefault();
      setEspnS2(found.espnS2);
      setSwid(found.swid);
    }
  }

  const creds = info.private ? { espnS2: espnS2.trim(), swid: swid.trim() } : undefined;

  return (
    <div className="wizard">
      {success && <div className="notice">{success}</div>}
      {error && <div className="error">{error}</div>}

      {step === "link" && (
        <>
          <div className="step-title"><span className="step-num">1</span>Paste your ESPN league link</div>
          <p className="hint">
            On ESPN, open your league and copy the address from your browser&apos;s address bar. It looks like{" "}
            <code>fantasy.espn.com/football/league?leagueId=12345678</code>.{" "}
            <a href="https://fantasy.espn.com/football/" target="_blank" rel="noreferrer">Open ESPN Fantasy ↗</a>
          </p>
          <input
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            placeholder="Paste league link or league ID"
            autoComplete="off"
            onKeyDown={(e) => e.key === "Enter" && league.trim() && checkLink()}
          />
          <button onClick={checkLink} disabled={busy || !league.trim()}>{busy ? "Checking…" : "Next"}</button>
        </>
      )}

      {step === "pick" && (
        <>
          <div className="step-title"><span className="step-num ok">✓</span>Found <b>&nbsp;{info.name}</b></div>
          <label htmlFor="espn-team">Which team is yours?</label>
          <select id="espn-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="" disabled>Select your team…</option>
            {info.teams?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.ownerName ? ` (${t.ownerName})` : ""}
              </option>
            ))}
          </select>
          <div className="wizard-actions">
            <button
              disabled={busy || !teamId}
              onClick={async () => {
                setBusy(true);
                await save(teamId, creds);
                setBusy(false);
              }}
            >
              {busy ? "Adding…" : "Add league"}
            </button>
            <button className="secondary" onClick={reset} disabled={busy}>Back</button>
          </div>
        </>
      )}

      {step === "private" && (
        <>
          <div className="step-title"><span className="step-num">🔒</span>This league is private</div>
          <p className="hint" style={{ marginTop: 0 }}>
            ESPN only shows private leagues to their members, so connect it once using two values from your ESPN login.
            It takes about 2 minutes on a computer, and then the league works on any device.
          </p>

          {onPhone && (
            <div className="callout warn">
              📱 <b>This step needs a computer.</b> Phone browsers can&apos;t show these values. Sign in to Fantasy
              Scoreboard on a computer to finish, and your league will then show up on your phone too.
            </div>
          )}

          <div className="step-title"><span className="step-num">2</span>Open ESPN and find your login values</div>
          <ol className="steps">
            <li>
              On this computer, open{" "}
              <a href="https://fantasy.espn.com/football/" target="_blank" rel="noreferrer">fantasy.espn.com ↗</a> and make
              sure you&apos;re signed in.
            </li>
          </ol>
          <div className="tabs" role="tablist">
            {(["chrome", "firefox", "safari"] as Browser[]).map((b) => (
              <button
                key={b}
                role="tab"
                aria-selected={browser === b}
                className={`tab${browser === b ? " active" : ""}`}
                onClick={() => setBrowser(b)}
              >
                {b === "chrome" ? "Chrome / Edge" : b === "firefox" ? "Firefox" : "Safari"}
              </button>
            ))}
          </div>
          <ol className="steps" start={2}>
            {BROWSER_STEPS[browser].map((s, i) => <li key={i}>{s}</li>)}
          </ol>

          <div className="step-title"><span className="step-num">3</span>Paste them here</div>
          <label htmlFor="espn_s2">
            espn_s2 {espnS2 && (s2Ok(espnS2) ? <span className="check ok">✓ looks right</span> : <span className="check bad">too short, copy the whole value</span>)}
          </label>
          <input id="espn_s2" value={espnS2} onChange={(e) => setEspnS2(e.target.value)} onPaste={smartPaste} placeholder="A long code, often starting with AE…" autoComplete="off" spellCheck={false} />
          <label htmlFor="swid">
            SWID {swid && (swidOk(swid) ? <span className="check ok">✓ looks right</span> : <span className="check bad">should look like {"{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"}</span>)}
          </label>
          <input id="swid" value={swid} onChange={(e) => setSwid(e.target.value)} onPaste={smartPaste} placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}" autoComplete="off" spellCheck={false} />
          <p className="hint">
            🔐 These are stored encrypted and only used to read this league. They work like your ESPN login, so don&apos;t
            share them anywhere else.
          </p>
          <div className="wizard-actions">
            <button onClick={connectPrivate} disabled={busy || !s2Ok(espnS2) || !swidOk(swid)}>
              {busy ? "Connecting…" : "Connect league"}
            </button>
            <button className="secondary" onClick={reset} disabled={busy}>Back</button>
          </div>
        </>
      )}
    </div>
  );
}
