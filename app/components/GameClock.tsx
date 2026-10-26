"use client";

import { useEffect, useState } from "react";
import type { PlayerLine } from "@/lib/providers/types";

// "Sun 8:25pm" in the viewer's time zone.
function formatKickoff(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M$/i, (_, m) => `${m.toLowerCase()}m`);
  return `${day} ${time}`;
}

// Where a player's NFL game stands: "Q3 2:54" while live, "Final", or kickoff time if not started.
export default function GameClock({ player }: { player: PlayerLine }) {
  // Kickoff is formatted after mount so it uses the browser's time zone, not the server's.
  const [kickoff, setKickoff] = useState("");
  useEffect(() => setKickoff(player.kickoff ? formatKickoff(player.kickoff) : ""), [player.kickoff]);

  if (!player.nflTeam) return null;
  let text = "";
  if (player.state === "live") text = player.clock ?? "Live";
  else if (player.state === "done") text = "Final";
  else if (player.state === "bye") text = "Bye";
  else text = kickoff;
  if (!text) return null;
  return <span className={`game-clock ${player.state}`}>{text}</span>;
}
