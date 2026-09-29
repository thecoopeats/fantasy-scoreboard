import type { GameState, PlayerLine, Progress } from "@/lib/providers/types";

const PACE_LABELS = { over: "Ahead of projected pace", under: "Behind projected pace", even: "On projected pace" };

// A player's points, green/red when ahead of/behind his projection for how much of his game is played.
export function PlayerPoints({ player }: { player: PlayerLine }) {
  return (
    <span className="pl-pts" title={player.pace ? PACE_LABELS[player.pace] : undefined}>
      <span className={player.pace ? `pace-${player.pace}` : undefined}>{player.points.toFixed(2)}</span>
      {player.projected != null && <span className="pl-proj">/ {player.projected.toFixed(1)}</span>}
    </span>
  );
}

// Starters whose games are finished / in progress / not started yet.
export function ProgressLine({ progress }: { progress?: Progress }) {
  if (!progress) return null;
  return (
    <span className="progress" title="Starters: finished · playing now · yet to play">
      <span className="p-done">✓ {progress.done} done</span>
      <span className="p-live">● {progress.live} playing</span>
      <span className="p-up">◷ {progress.upcoming} left</span>
    </span>
  );
}

const LABELS: Record<GameState, string> = { done: "Final", live: "Live", upcoming: "Yet to play", bye: "Bye / no game" };

export function StateDot({ state }: { state: GameState }) {
  return <span className={`dot ${state}`} title={LABELS[state]} aria-label={LABELS[state]} />;
}
