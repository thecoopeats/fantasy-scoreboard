import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

const ERRORS: Record<string, string> = {
  link: "That sign-in link didn't work (it may have expired or already been used). Enter the code from the same email instead, or send a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await getUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 64 }}>
      <h1 style={{ marginBottom: 4 }}>🏈 Fantasy Scoreboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>Your Sleeper, ESPN and Yahoo matchups in one place.</p>
      <div className="card">
        <LoginForm urlError={error ? ERRORS[error] : undefined} startWithCode={error === "link"} />
      </div>
    </main>
  );
}
