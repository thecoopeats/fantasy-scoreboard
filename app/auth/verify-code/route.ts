import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Signs in with the code from the email. Works on any device, unlike the link.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const token = String(body?.token ?? "").replace(/\s/g, "");
  if (!email || !token) {
    return NextResponse.json({ error: "Enter your email and the code from the email." }, { status: 400 });
  }
  if (!isAllowed(email)) {
    return NextResponse.json({ error: "That email isn't on the invite list. Ask the site owner to add you." }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    return NextResponse.json(
      { error: "That code didn't work. It may have expired or already been used, so request a new one." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
