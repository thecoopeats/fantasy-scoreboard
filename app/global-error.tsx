"use client";

// Last-resort error screen (when the whole layout fails).
export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ background: "#0b1220", color: "#e8edf7", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "64px 16px" }}>
        <h2>Something went wrong</h2>
        <p style={{ color: "#8b98b3" }}>The site may have just been updated. Reloading usually fixes it.</p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: "10px 16px", background: "#3b82f6", color: "white", border: 0, borderRadius: 8, fontSize: 16 }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
