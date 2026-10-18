"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { teamColors } from "@/lib/teamColors";

export interface CelebrationEvent {
  id: string;
  playerName: string;
  pos?: string;
  nflTeam?: string;
  fantasyTeam: string;
  leagueName: string;
  points?: number; // points gained on the play
  touchdown: boolean;
}

const SHOW_MS = 3000;
const PIECES = 70;

// Confetti pieces flying out from the popup in random directions, in the player's team colors.
function Confetti({ colors }: { colors: string[] }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 220;
        return {
          i,
          style: {
            "--dx": `${Math.cos(angle) * dist}px`,
            "--dy": `${Math.sin(angle) * dist - 60}px`,
            "--rot": `${Math.round(Math.random() * 720 - 360)}deg`,
            background: colors[i % colors.length],
            animationDelay: `${Math.random() * 120}ms`,
            width: `${6 + Math.random() * 6}px`,
            height: `${8 + Math.random() * 8}px`,
          } as CSSProperties,
        };
      }),
    [colors]
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p) => <span key={p.i} style={p.style} />)}
    </div>
  );
}

// Popup for one of your players' big plays. Closes itself after 3 seconds.
export default function Celebration({ event, onClose }: { event: CelebrationEvent; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, SHOW_MS);
    return () => clearTimeout(t);
  }, [event.id, onClose]);

  const colors = teamColors(event.nflTeam);
  return (
    <div className="celebration-wrap" role="status" aria-live="polite">
      <div className="celebration" style={{ borderColor: colors[0] }}>
        <Confetti colors={colors} />
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="celebration-title">{event.touchdown ? "🏈 Touchdown!" : "🔥 Big play!"}</div>
        <div className="celebration-player">
          {event.playerName}
          <span className="muted"> {[event.pos, event.nflTeam].filter(Boolean).join(" · ")}</span>
        </div>
        {event.points != null && <div className="celebration-points">+{event.points.toFixed(2)} pts</div>}
        <div className="celebration-team">
          {event.fantasyTeam}
          <span className="muted"> · {event.leagueName}</span>
        </div>
      </div>
    </div>
  );
}
