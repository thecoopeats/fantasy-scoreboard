"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Matchup, MatchupsResponse, Side } from "@/lib/providers/types";
import Celebration, { type CelebrationEvent } from "./components/Celebration";
import { ProgressLine } from "./components/GameProgress";
import Lineups from "./components/Lineups";
import { REFRESH_IDLE_SECONDS, REFRESH_LIVE_SECONDS } from "@/lib/nfl";

function fmt(n: number) {
  return n.toFixed(2);
}

// A play worth this many points (or any touchdown) by one of your starters gets a celebration.
const BIG_PLAY_POINTS = 5;
// Points are compared against the last few refreshes, so a touchdown whose stats arrive a refresh
// after its points still counts as one play.
const HISTORY = 3;

interface PlayerHistory {
  points: number[];
  tds?: number;
}

// Your starters' big plays since the last refresh, updating `history` as it goes.
function findBigPlays(matchups: Matchup[], history: Map<string, PlayerHistory>): CelebrationEvent[] {
  const events: CelebrationEvent[] = [];
  for (const m of matchups) {
    for (const p of m.me.starters ?? []) {
      const key = `${m.id}:${p.id}`;
      const prev = history.get(key);
      if (!prev) {
        history.set(key, { points: [p.points], tds: p.tds });
        continue;
      }
      const gain = Math.round((p.points - Math.min(...prev.points)) * 100) / 100;
      const touchdown = p.tds != null && prev.tds != null && p.tds > prev.tds;
      if (touchdown || gain >= BIG_PLAY_POINTS) {
        events.push({
          id: `${key}:${Date.now()}`,
          playerName: p.name,
          pos: p.pos,
          nflTeam: p.nflTeam,
          fantasyTeam: m.me.teamName,
          leagueName: m.leagueName,
          points: gain > 0 ? gain : undefined,
          touchdown,
        });
        history.set(key, { points: [p.points], tds: p.tds });
      } else {
        history.set(key, { points: [...prev.points, p.points].slice(-HISTORY), tds: p.tds ?? prev.tds });
      }
    }
  }
  return events;
}

function TeamRow({ side, me }: { side: Side; me?: boolean }) {
  return (
    <div className={`team${me ? " me" : ""}`}>
      <div className="name">
        {side.teamName}
        {side.record && <span className="record">{side.record}</span>}
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
  const [celebrations, setCelebrations] = useState<CelebrationEvent[]>([]);
  const history = useRef<{ week: number; players: Map<string, PlayerHistory> } | null>(null);

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

  const live = data?.week === week && data.live;

  // Compare each refresh with the ones before it; the first load of a week only sets the baseline.
  useEffect(() => {
    if (!data) return;
    if (history.current?.week !== data.week) history.current = { week: data.week, players: new Map() };
    const events = findBigPlays(data.matchups, history.current.players);
    if (events.length) setCelebrations((q) => [...q, ...events]);
  }, [data]);

  const closeCelebration = useCallback(() => setCelebrations((q) => q.slice(1)), []);

  useEffect(() => {
    load(week);
  }, [week, load]);

  // Poll fast while games are on, slowly otherwise; refresh right away when the tab comes back into view.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load(week, true);
    };
    const t = setInterval(refresh, (live ? REFRESH_LIVE_SECONDS : REFRESH_IDLE_SECONDS) * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [week, live, load]);

  const matchups = data?.week === week ? data.matchups : [];
  const winning = matchups.filter((m) => m.opponent && m.me.score > m.opponent.score).length;
  const losing = matchups.filter((m) => m.opponent && m.me.score < m.opponent.score).length;

  return (
    <>
      {celebrations[0] && <Celebration key={celebrations[0].id} event={celebrations[0]} onClose={closeCelebration} />}

      <div className="weekbar">
        <button className="secondary" onClick={() => setWeek((w) => Math.max(1, w - 1))} disabled={week <= 1}>
          ‹ Prev
        </button>
        <div className="title">
          Week {week}
          <span className="muted">
            {loading
              ? "Loading…"
              : updated
                ? `${live ? "● Live · " : ""}Updated ${updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: live ? "2-digit" : undefined })}`
                : ""}
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
