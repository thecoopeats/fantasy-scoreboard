import type { PlayerLine } from "@/lib/providers/types";
import { PlayerPoints, StateDot } from "./GameProgress";

interface LineupTeam {
  teamName: string;
  starters: PlayerLine[];
}

function Lineup({ team }: { team: LineupTeam }) {
  if (!team.starters.length) return null;
  return (
    <div className="lineup">
      <div className="lineup-title">{team.teamName}</div>
      {team.starters.map((p) => (
        <div key={p.id} className="lineup-row">
          <StateDot state={p.state} />
          <span className="pl-name">
            {p.name} <span className="muted">{[p.pos, p.nflTeam].filter(Boolean).join(" · ")}</span>
          </span>
          <PlayerPoints player={p} />
        </div>
      ))}
    </div>
  );
}

// Collapsible starting lineups for one matchup.
export default function Lineups({ a, b }: { a: LineupTeam; b?: LineupTeam | null }) {
  if (!a.starters.length && !b?.starters.length) return null;
  return (
    <details className="lineups">
      <summary>Lineups</summary>
      <div className="lineup-grid">
        <Lineup team={a} />
        {b && <Lineup team={b} />}
      </div>
    </details>
  );
}
