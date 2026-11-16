import { winProbability, type WinTeam as Team } from "@/lib/providers/types";

// Win chance for both teams of a matchup, as a split bar with percentages.
export default function WinChance({ a, b }: { a: Team; b: Team }) {
  const p = winProbability(a, b);
  if (p == null) return null;
  // Never show a false certainty while a game is still being played.
  const over = [...a.starters, ...b.starters].every((s) => s.state === "done" || s.state === "bye");
  const pct = (x: number) => (over ? Math.round(x * 100) : Math.min(99, Math.max(1, Math.round(x * 100))));
  const pa = pct(p);
  const pb = 100 - pa;
  return (
    <div className="winchance" title="Estimated chance of winning, from scores, projections and game time left">
      <span className={pa >= pb ? "lead" : ""}>{pa}%</span>
      <div className="bar"><div className="fill" style={{ width: `${pa}%` }} /></div>
      <span className={pb > pa ? "lead" : ""}>{pb}%</span>
    </div>
  );
}
