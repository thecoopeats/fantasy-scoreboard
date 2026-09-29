import Link from "next/link";

export default function Header({ email }: { email?: string }) {
  return (
    <header className="top">
      <h1>
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>🏈 Fantasy Scoreboard</Link>
      </h1>
      <nav>
        <Link href="/">Scores</Link>
        <Link href="/settings">My leagues</Link>
        <form action="/auth/signout" method="post">
          <button className="link" type="submit" title={email}>Sign out</button>
        </form>
      </nav>
    </header>
  );
}
