import { redirect } from "next/navigation";

// Where the sign-in email's link lands. Signing in takes a tap, so link scanners can't use it up.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; code?: string }>;
}) {
  const { token_hash, type, code } = await searchParams;
  if (!token_hash && !code) redirect("/login?error=link");

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 64 }}>
      <h1 style={{ marginBottom: 4 }}>🏈 Fantasy Scoreboard</h1>
      <div className="card" style={{ marginTop: 16 }}>
        <p style={{ marginTop: 0 }}>One more step. Tap the button to finish signing in.</p>
        <form action="/auth/verify-link" method="post">
          {token_hash && <input type="hidden" name="token_hash" value={token_hash} />}
          {type && <input type="hidden" name="type" value={type} />}
          {code && <input type="hidden" name="code" value={code} />}
          <button type="submit" style={{ width: "100%" }}>Sign in</button>
        </form>
      </div>
    </main>
  );
}
