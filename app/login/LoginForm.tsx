"use client";

import { useActionState } from "react";
import { sendLink, verifyCode, type LoginState } from "./actions";

export default function LoginForm({ urlError }: { urlError?: string }) {
  const [sendState, send, sending] = useActionState<LoginState, FormData>(sendLink, {});
  const [codeState, verify, verifying] = useActionState<LoginState, FormData>(verifyCode, {});

  if (!sendState.sent) {
    return (
      <form action={send}>
        {(sendState.error || urlError) && <div className="error">{sendState.error || urlError}</div>}
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        <button type="submit" disabled={sending}>{sending ? "Sending…" : "Email me a sign-in link"}</button>
      </form>
    );
  }

  return (
    <form action={verify}>
      <div className="notice">
        Check <b>{sendState.email}</b>. Click the link in the email, or type the code from it below.
      </div>
      {codeState.error && <div className="error">{codeState.error}</div>}
      <input type="hidden" name="email" value={sendState.email} />
      <label htmlFor="token">Code</label>
      <input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" />
      <button type="submit" disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</button>
      <p className="muted">
        Didn&apos;t get it? Check spam, or <a href="/login">try again</a>.
      </p>
    </form>
  );
}
