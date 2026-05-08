import { PLAN_LIMITS } from "@/lib/research/types";
import { researchErrorResponse } from "@/lib/research/http";
import { supabaseConfigured, userFromRequest } from "@/lib/research/supabase";
import { logEvent } from "@/lib/auth/log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const user = await userFromRequest(request);
    const payload = {
      configured: supabaseConfigured(),
      authenticated: !user.isDemo,
      accessStatus: user.accessStatus ?? (user.isDemo ? "demo" : "accepted"),
      user,
      limits: PLAN_LIMITS[user.plan],
    };
    logEvent("info", "research_session_done", {
      route: "/api/research/session",
      userId: user.isDemo ? "demo" : user.id,
      accessStatus: payload.accessStatus,
      ms: Date.now() - start,
    });
    return Response.json(payload);
  } catch (err) {
    logEvent("error", "research_session_failed", {
      route: "/api/research/session",
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    });
    return researchErrorResponse(err);
  }
}
