"use client";

import { useState, type FormEvent } from "react";

async function post(path: string, body: object): Promise<{ ok?: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { error: "Couldn't reach the site. Check your connection and try again." };
  }
}

export default function LoginForm({ urlError, startWithCode }: { urlError?: string; startWithCode?: boolean }) {
  const [step, setStep] = useState<"email" | "code">(startWithCode ? "code" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(urlError);
  const [busy, setBusy] = useState(false);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const r = await post("/auth/send-link", { email });
    setBusy(false);
    if (r.ok) {
      setSent(true);
      setStep("code");
    } else setError(r.error ?? "Something went wrong.");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const r = await post("/auth/verify-code", { email, token: code });
    if (r.ok) {
      window.location.href = "/";
      return;
    }
    setBusy(false);
    setError(r.error ?? "Something went wrong.");
  }

  if (step === "email") {
    return (
      <form onSubmit={sendLink}>
        {error && <div className="error">{error}</div>}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
        <p className="muted" style={{ marginBottom: 0 }}>
          Already have a code?{" "}
          <button type="button" className="link-inline" onClick={() => { setError(undefined); setStep("code"); }}>
            Enter it here
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={verify}>
      {sent && (
        <div className="notice">
          Check <b>{email}</b>. Tap the link in the email, or enter the code from it below.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label htmlFor="token">Code from the email</label>
      <input
        id="token"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
      <p className="muted" style={{ marginBottom: 0 }}>
        Need a new email?{" "}
        <button type="button" className="link-inline" onClick={() => { setError(undefined); setSent(false); setStep("email"); }}>
          Send another
        </button>{" "}
        (check spam too).
      </p>
    </form>
  );
}
