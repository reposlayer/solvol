import { NextResponse } from "next/server";
import { logEvent } from "@/lib/auth/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    logEvent("info", "auth_logout_done", {
      route: "/auth/logout",
      ms: Date.now() - start,
    });
  } catch (err) {
    logEvent("error", "auth_logout_failed", {
      route: "/auth/logout",
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    });
  }
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
