"use client";

import { useEffect } from "react";

// Shown instead of a blank crash. The usual cause is a page that was open while a new version deployed.
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    // Reload automatically once if the site was updated underneath this page.
    if (/server action/i.test(error.message)) {
      try {
        const last = Number(sessionStorage.getItem("auto-reload-at") ?? 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem("auto-reload-at", String(Date.now()));
          window.location.reload();
        }
      } catch {
        // Storage unavailable; the Reload button still works.
      }
    }
  }, [error]);

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 64 }}>
      <div className="card empty">
        <h2>Something went wrong</h2>
        <p className="muted">The site may have just been updated. Reloading usually fixes it.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    </main>
  );
}
