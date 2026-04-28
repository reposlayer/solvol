import { explainMarketMove } from "@/lib/catalyst/engine";
import { persistCatalystRun, userFromRequest } from "@/lib/research/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const marketId = url.searchParams.get("marketId")?.trim();
  if (!marketId) {
    return Response.json({ error: "Missing required query param marketId" }, { status: 400 });
  }

  try {
    const payload = await explainMarketMove(marketId);
    const user = await userFromRequest(request).catch(() => null);
    const persistedRun = await persistCatalystRun(payload, user).catch(() => null);
    return Response.json({ ...payload, persistedRunId: persistedRun?.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
