"use client";

import { useEffect, useRef } from "react";

// Calls `refresh` every `seconds` while the page is visible, and right away when it comes back.
//
// iOS home-screen web apps are frozen when you leave them. Timers stop, `visibilitychange` is not
// always delivered on resume, and a request that was in flight can hang forever. So this also
// listens for `pageshow`, `focus` and `online`, and ticks on a short timer that checks how long
// it has been since the last refresh rather than trusting one long interval.
export function useAutoRefresh(refresh: () => void, seconds: number) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    let last = Date.now();
    const run = () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      latest.current();
    };
    const resume = () => run();
    const tick = () => {
      if (Date.now() - last >= seconds * 1000) run();
    };

    const t = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [seconds]);
}
