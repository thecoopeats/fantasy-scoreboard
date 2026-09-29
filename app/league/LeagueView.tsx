import Link from "next/link";
import type { LeagueWeek, PlayerLine, TeamWeek } from "@/lib/providers/types";
import { ProgressLine, StateDot } from "../components/GameProgress";

const fmt = (n: number) => n.toFixed(2);

function TeamLine({ team, mine, leading }: { team: TeamWeek; mine: boolean; leading: boolean }) {
  return (
    <div className={`team${mine ? " me" : ""}${leading ? " leading" : ""}`}>
      <div className="name">
        {team.teamName}
        {mine && <span className="you">you</span>}
        {team.ownerName && team.ownerName !== team.teamName && <span className="owner">{team.ownerName}</span>}
        <ProgressLine progress={team.progress} />
      </div>
      <div className="score">
        {fmt(team.score)}
        {team.projected != null && <span className="proj">proj {fmt(team.projected)}</span>}
      </div>
    </div>
  );
}

function Lineup({ team }: { team: TeamWeek }) {
  const starters = team.players.filter((p) => p.starter);
  if (!starters.length) return null;
  return (
    <div className="lineup">
      <div className="lineup-title">{team.teamName}</div>
      {starters.map((p) => (
        <div key={p.id} className="lineup-row">
          <StateDot state={p.state} />
          <span className="pl-name">
            {p.name} <span className="muted">{[p.pos, p.nflTeam].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="pl-pts">{fmt(p.points)}</span>
        </div>
      ))}
    </div>
  );
}

export default function LeagueView({
  platform,
  leagueId,
  week,
  lw,
  error,
  isMine,
}: {
  platform: string;
  leagueId: string;
  week: number;
  lw: LeagueWeek | null;
  error: string | null;
  isMine: (t: TeamWeek) => boolean;
}) {
  const inGame = (g: LeagueWeek["games"][number]) => isMine(g.a) || (!!g.b && isMine(g.b));
  // Your game first.
  const games = [...(lw?.games ?? [])].sort((x, y) => Number(inGame(y)) - Number(inGame(x)));

  const top: (PlayerLine & { fantasyTeam: string })[] = games
    .flatMap((g) => [g.a, g.b])
    .filter((t): t is TeamWeek => !!t)
    .flatMap((t) => t.players.map((p) => ({ ...p, fantasyTeam: t.teamName })))
    .sort((a, b) => b.points - a.points)
    .slice(0, 20);

  const base = `/league/${platform}/${leagueId}`;

  return (
    <>
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/" className="back">‹ All my scores</Link>
      </p>

      <div className="league-title">
        <h2 style={{ margin: 0 }}>
          <span className={`badge ${platform}`}>{platform}</span>
          {lw?.leagueName ?? "League"}
        </h2>
        {lw && <a href={lw.url} target="_blank" rel="noreferrer" className="muted">Open ↗</a>}
      </div>

      <div className="weekbar">
        {week > 1 ? <Link className="button secondary" href={`${base}?week=${week - 1}`}>‹ Prev</Link> : <span />}
        <div className="title">Week {week}</div>
        {week < 18 ? <Link className="button secondary" href={`${base}?week=${week + 1}`}>Next ›</Link> : <span />}
      </div>

      {error && <div className="error">{error}</div>}

      {lw && (
        <>
          <h3 className="section">All matchups</h3>
          {games.length === 0 && <div className="card empty muted">No matchups this week.</div>}
          {games.map((g, i) => (
            <div key={i} className={`card matchup${inGame(g) ? " my-game" : ""}`}>
              <TeamLine team={g.a} mine={isMine(g.a)} leading={!!g.b && g.a.score > g.b.score} />
              {g.b ? (
                <TeamLine team={g.b} mine={isMine(g.b)} leading={g.b.score > g.a.score} />
              ) : (
                <div className="team muted">Bye week</div>
              )}
              {g.a.players.length > 0 && (
                <details className="lineups">
                  <summary>Lineups</summary>
                  <div className="lineup-grid">
                    <Lineup team={g.a} />
                    {g.b && <Lineup team={g.b} />}
                  </div>
                </details>
              )}
            </div>
          ))}

          <h3 className="section">Top 20 players · Week {week}</h3>
          {top.length === 0 ? (
            <div className="card empty muted">No player scores yet.</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="players">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Fantasy team</th>
                    <th className="num">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p, i) => (
                    <tr key={`${p.id}-${i}`}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <StateDot state={p.state} />
                        {p.name}
                        <span className="muted"> {[p.pos, p.nflTeam].filter(Boolean).join(" · ")}</span>
                        {!p.starter && <span className="bench">bench</span>}
                      </td>
                      <td className="muted">{p.fantasyTeam}</td>
                      <td className="num">{fmt(p.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted legend">
            <span><StateDot state="done" />final</span>
            <span><StateDot state="live" />playing now</span>
            <span><StateDot state="upcoming" />yet to play</span>
            <span><StateDot state="bye" />bye</span>
          </p>
        </>
      )}
    </>
  );
}
