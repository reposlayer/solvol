import { PLAN_LIMITS } from "@/lib/research/types";
import { researchErrorResponse } from "@/lib/research/http";
import { supabaseConfigured, userFromRequest } from "@/lib/research/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await userFromRequest(request);
    return Response.json({
      configured: supabaseConfigured(),
      user,
      limits: PLAN_LIMITS[user.plan],
    });
  } catch (err) {
    return researchErrorResponse(err);
  }
}
