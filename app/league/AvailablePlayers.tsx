"use client";

import { Fragment, useState } from "react";
import type { GameLog, PlayerLine } from "@/lib/providers/types";
import { PlayerPoints, StateDot } from "../components/GameProgress";
import GameClock from "../components/GameClock";

const fmt = (n: number) => n.toFixed(2);

type LogState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; log: GameLog };

function GameLogTable({ state, week }: { state: LogState; week: number }) {
  if (state.status === "loading") return <div className="muted gamelog-msg">Loading game log…</div>;
  if (state.status === "error") return <div className="muted gamelog-msg">{state.message}</div>;
  const { log } = state;
  return (
    <div className="gamelog">
      <div className="gamelog-summary muted">
        {fmt(log.total)} pts in {log.gamesPlayed} game{log.gamesPlayed === 1 ? "" : "s"}
        {log.gamesPlayed > 0 && <> · {fmt(log.total / log.gamesPlayed)} per game</>}
      </div>
      <table>
        <thead>
          <tr>
            <th>Wk</th>
            <th>Opp</th>
            <th>Result</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {[...log.weeks].reverse().map((w) => (
            <tr key={w.week} className={w.week === week ? "current" : undefined}>
              <td>{w.week}</td>
              <td>{w.bye ? <span className="muted">BYE</span> : (w.opponent ?? "–")}</td>
              <td className="muted">{w.result ?? ""}</td>
              <td className="num">
                {w.points != null ? fmt(w.points) : <span className="muted">{w.bye ? "" : "–"}</span>}
                {w.points == null && w.projected != null && <span className="pl-proj">proj {w.projected.toFixed(1)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Top available players this week. Tap a player to see their week-by-week points this season.
export default function AvailablePlayers({
  players,
  platform,
  leagueId,
  week,
}: {
  players: PlayerLine[];
  platform: string;
  leagueId: string;
  week: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, LogState>>({});

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (logs[id]?.status === "ok" || logs[id]?.status === "loading") return;
    setLogs((l) => ({ ...l, [id]: { status: "loading" } }));
    try {
      const qs = new URLSearchParams({ platform, leagueId, playerId: id, week: String(week) });
      const res = await fetch(`/api/game-log?${qs}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setLogs((l) => ({ ...l, [id]: { status: "ok", log: body as GameLog } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't load the game log.";
      setLogs((l) => ({ ...l, [id]: { status: "error", message } }));
    }
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <table className="players available-players">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th className="num">Wk {week}</th>
            <th className="num">Season</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <Fragment key={`${p.id}-${i}`}>
              <tr
                className={`clickable${open === p.id ? " open" : ""}`}
                onClick={() => toggle(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(p.id);
                  }
                }}
                tabIndex={0}
                aria-expanded={open === p.id}
                title="Show game log"
              >
                <td className="muted">{i + 1}</td>
                <td>
                  <span className="chev" aria-hidden>{open === p.id ? "▾" : "▸"}</span>
                  <StateDot state={p.state} />
                  {p.name}
                  <span className="muted"> {[p.pos, p.nflTeam].filter(Boolean).join(" · ")}</span>
                  <GameClock player={p} />
                </td>
                <td className="num"><PlayerPoints player={p} /></td>
                <td className="num">{p.seasonPoints != null ? fmt(p.seasonPoints) : "–"}</td>
              </tr>
              {open === p.id && (
                <tr className="gamelog-row">
                  <td colSpan={4}>
                    <GameLogTable state={logs[p.id] ?? { status: "loading" }} week={week} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
