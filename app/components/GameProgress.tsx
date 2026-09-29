import type { GameState, Progress } from "@/lib/providers/types";

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
