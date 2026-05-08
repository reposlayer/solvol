import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  accessStatusForEmail,
  authRequired,
  buildAuthRedirect,
  isProtectedApiPath,
  isProtectedPagePath,
  serviceConfigured,
} from "@/lib/auth/beta-access";
import { getSupabasePublicConfig } from "@/lib/supabase/env";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const cfg = getSupabasePublicConfig();
  const pathname = request.nextUrl.pathname;
  const mustProtect = isProtectedPagePath(pathname) || isProtectedApiPath(pathname);

  if (!cfg) {
    const protectedApiHasServiceRole = isProtectedApiPath(pathname) && serviceConfigured();
    if (mustProtect && (authRequired() || protectedApiHasServiceRole)) {
      if (isProtectedApiPath(pathname)) {
        return Response.json({ error: "Supabase auth is not configured" }, { status: 503 });
      }
      return NextResponse.redirect(new URL("/login?error=auth_not_configured", request.url));
    }
    return response;
  }

  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;

  if (!mustProtect) return response;

  if (error || !claims) {
    if (isProtectedApiPath(pathname)) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL(buildAuthRedirect(request.url), request.url));
  }

  if (authRequired()) {
    const accessStatus = await accessStatusForEmail(email).catch(() => "denied");
    if (accessStatus === "accepted" || accessStatus === "invited") {
      return response;
    }
    if (isProtectedApiPath(pathname)) {
      return Response.json({ error: "Beta invite required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/waitlist?status=invite-required", request.url));
  }

  return response;
}
