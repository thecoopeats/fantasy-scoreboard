import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Posted from the /auth/confirm page's button. Using a button (not a plain link visit) means
// email link scanners can't use up the one-time link before the person taps it.
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "email") as EmailOtpType;
  const code = String(form.get("code") ?? "");
  const supabase = await createClient();

  let ok = false;
  if (tokenHash) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  return NextResponse.redirect(ok ? `${origin}/` : `${origin}/login?error=link`, { status: 303 });
}
