import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Emails a sign-in link + code. A plain route (not a server action) so it keeps working across deploys.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!isAllowed(email)) {
    return NextResponse.json({ error: "That email isn't on the invite list. Ask the site owner to add you." }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${request.nextUrl.origin}/auth/confirm` },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
