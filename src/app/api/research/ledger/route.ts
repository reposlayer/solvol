import { researchErrorResponse } from "@/lib/research/http";
import { listLedger, userFromRequest } from "@/lib/research/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await userFromRequest(request);
    const url = new URL(request.url);
    const marketId = url.searchParams.get("marketId");
    const items = await listLedger(user, marketId);
    return Response.json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return researchErrorResponse(err);
  }
}
