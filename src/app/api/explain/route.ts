import { explainMarketMove } from "@/lib/catalyst/engine";
import { persistCatalystRun, ResearchStoreError, userFromRequest } from "@/lib/research/supabase";
import { researchErrorResponse } from "@/lib/research/http";
import { logEvent } from "@/lib/auth/log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const start = Date.now();
  const url = new URL(request.url);
  const marketId = url.searchParams.get("marketId")?.trim();
  if (!marketId) {
    return Response.json({ error: "Missing required query param marketId" }, { status: 400 });
  }

  try {
    const user = process.env.SUPABASE_REQUIRE_AUTH === "true"
      ? await userFromRequest(request)
      : await userFromRequest(request).catch(() => null);
    const payload = await explainMarketMove(marketId);
    const persistedRun = await persistCatalystRun(payload, user).catch(() => null);
    logEvent("info", "explain_done", {
      route: "/api/explain",
      marketId,
      userId: user?.isDemo ? "demo" : user?.id ?? "anonymous",
      persisted: Boolean(persistedRun),
      ms: Date.now() - start,
    });
    return Response.json({ ...payload, persistedRunId: persistedRun?.id ?? null });
  } catch (err) {
    logEvent("error", "explain_failed", {
      route: "/api/explain",
      marketId,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    });
    if (err instanceof ResearchStoreError) {
      return researchErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
