import { NextResponse } from "next/server";
import { acceptBetaInviteForUser, safeReturnPath } from "@/lib/auth/beta-access";
import { logEvent } from "@/lib/auth/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirect(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function GET(request: Request) {
  const start = Date.now();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeReturnPath(url.searchParams.get("next"));

  if (!code) {
    return redirect("/login?error=missing_code", request);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) {
      logEvent("error", "auth_callback_exchange_failed", {
        route: "/auth/callback",
        error: exchanged.error.message,
        ms: Date.now() - start,
      });
      return redirect("/login?error=invalid_link", request);
    }

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;
    if (userResult.error || !user) {
      return redirect("/login?error=session_missing", request);
    }

    const accepted = await acceptBetaInviteForUser({
      id: user.id,
      email: user.email ?? null,
      displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    });

    if (!accepted.user) {
      await supabase.auth.signOut();
      logEvent("warn", "auth_callback_access_denied", {
        route: "/auth/callback",
        userId: user.id,
        status: accepted.status,
        ms: Date.now() - start,
      });
      return redirect(`/waitlist?status=${encodeURIComponent(accepted.status)}`, request);
    }

    logEvent("info", "auth_callback_done", {
      route: "/auth/callback",
      userId: user.id,
      accessStatus: accepted.status,
      ms: Date.now() - start,
    });
    return redirect(next, request);
  } catch (err) {
    logEvent("error", "auth_callback_failed", {
      route: "/auth/callback",
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    });
    return redirect("/login?error=request_failed", request);
  }
}
