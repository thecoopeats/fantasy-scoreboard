"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Matchup, MatchupsResponse, Side } from "@/lib/providers/types";
import { ProgressLine } from "./components/GameProgress";
import Lineups from "./components/Lineups";

const REFRESH_MS = 60_000;

function fmt(n: number) {
  return n.toFixed(2);
}

function TeamRow({ side, me }: { side: Side; me?: boolean }) {
  return (
    <div className={`team${me ? " me" : ""}`}>
      <div className="name">
        {side.teamName}
        {side.ownerName && side.ownerName !== side.teamName && <span className="owner">{side.ownerName}</span>}
        <ProgressLine progress={side.progress} />
      </div>
      <div className="score">
        {fmt(side.score)}
        {side.projected != null && <span className="proj">proj {fmt(side.projected)}</span>}
      </div>
    </div>
  );
}

export function MatchupCard({ m }: { m: Matchup }) {
  const status =
    !m.opponent || m.me.score === m.opponent.score ? "" : m.me.score > m.opponent.score ? "winning" : "losing";
  return (
    <div className={`card matchup ${status}`}>
      <div className="head">
        <div>
          <span className={`badge ${m.platform}`}>{m.platform}</span>
          {m.leagueName}
        </div>
        <div className="links">
          {m.leagueHref && <Link href={m.leagueHref}>All matchups &amp; top players ›</Link>}
          <a href={m.url} target="_blank" rel="noreferrer">Open ↗</a>
        </div>
      </div>
      <TeamRow side={m.me} me />
      {m.opponent ? <TeamRow side={m.opponent} /> : <div className="team muted">Bye week</div>}
      <Lineups
        a={{ teamName: m.me.teamName, starters: m.me.starters ?? [] }}
        b={m.opponent ? { teamName: m.opponent.teamName, starters: m.opponent.starters ?? [] } : null}
      />
    </div>
  );
}

export default function Dashboard({ initialWeek }: { initialWeek: number }) {
  const [week, setWeek] = useState(initialWeek);
  const [data, setData] = useState<MatchupsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (w: number, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/matchups?week=${w}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      setData(await res.json());
      setUpdated(new Date());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(week);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(week, true);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [week, load]);

  const matchups = data?.week === week ? data.matchups : [];
  const winning = matchups.filter((m) => m.opponent && m.me.score > m.opponent.score).length;
  const losing = matchups.filter((m) => m.opponent && m.me.score < m.opponent.score).length;

  return (
    <>
      <div className="weekbar">
        <button className="secondary" onClick={() => setWeek((w) => Math.max(1, w - 1))} disabled={week <= 1}>
          ‹ Prev
        </button>
        <div className="title">
          Week {week}
          <span className="muted">
            {loading ? "Loading…" : updated ? `Updated ${updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
          </span>
        </div>
        <button className="secondary" onClick={() => setWeek((w) => Math.min(18, w + 1))} disabled={week >= 18}>
          Next ›
        </button>
      </div>

      {failed && <div className="error">Couldn&apos;t load scores. Retrying automatically…</div>}
      {data?.errors.map((e, i) => (
        <div className="error" key={i}>
          <b>{e.source}:</b> {e.message}
        </div>
      ))}

      {matchups.length > 0 && (
        <div className="summary">
          <div className="stat"><b style={{ color: "var(--win)" }}>{winning}</b><span className="muted">Winning</span></div>
          <div className="stat"><b style={{ color: "var(--lose)" }}>{losing}</b><span className="muted">Losing</span></div>
          <div className="stat"><b>{matchups.length}</b><span className="muted">Leagues</span></div>
        </div>
      )}

      {matchups.map((m) => <MatchupCard key={m.id} m={m} />)}

      {!loading && data?.week === week && matchups.length === 0 && (
        <div className="card empty muted">No matchups found for week {week}.</div>
      )}
    </>
  );
}
