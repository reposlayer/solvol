import { NextResponse } from "next/server";
import { findBetaInviteByEmail, normalizeInviteEmail, safeReturnPath } from "@/lib/auth/beta-access";
import { logEvent } from "@/lib/auth/log";
import { createSupabaseServerClient, supabaseAuthConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function loginInput(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      email: typeof body.email === "string" ? body.email : "",
      next: typeof body.next === "string" ? body.next : null,
    };
  }
  const form = await request.formData();
  return {
    email: String(form.get("email") ?? ""),
    next: String(form.get("next") ?? "") || null,
  };
}

function redirect(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    if (!supabaseAuthConfigured()) {
      return redirect("/login?error=auth_not_configured", request);
    }

    const input = await loginInput(request);
    const email = normalizeInviteEmail(input.email);
    if (!email) {
      return redirect("/login?error=invalid_email", request);
    }

    const invite = await findBetaInviteByEmail(email).catch(() => null);
    if (!invite || invite.status === "revoked") {
      logEvent("info", "beta_login_waitlist_redirect", {
        route: "/api/auth/login",
        email,
        invited: Boolean(invite),
        ms: Date.now() - start,
      });
      return redirect(`/waitlist?email=${encodeURIComponent(email)}&status=invite-required`, request);
    }

    const next = safeReturnPath(input.next);
    const origin = new URL(request.url).origin;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      logEvent("error", "beta_login_otp_failed", {
        route: "/api/auth/login",
        email,
        error: error.message,
        ms: Date.now() - start,
      });
      return redirect("/login?error=send_failed", request);
    }

    logEvent("info", "beta_login_otp_sent", {
      route: "/api/auth/login",
      email,
      inviteStatus: invite.status,
      ms: Date.now() - start,
    });
    return redirect(`/login?sent=1&email=${encodeURIComponent(email)}`, request);
  } catch (err) {
    logEvent("error", "beta_login_failed", {
      route: "/api/auth/login",
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    });
    return redirect("/login?error=request_failed", request);
  }
}
