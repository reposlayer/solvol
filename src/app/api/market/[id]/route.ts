import {
  fetchGammaMarket,
  fetchMidpoint,
  getNoTokenFromMarket,
  resolveMarketEventContext,
  fetchSpread,
  fetchYesPriceHistory,
  getYesTokenFromMarket,
} from "@/lib/polymarket/client";
import { detectLargestJumpPoint } from "@/lib/polymarket/market-intel";
import { researchErrorResponse } from "@/lib/research/http";
import { ResearchStoreError, userFromRequest } from "@/lib/research/supabase";
import { mockMarketSnapshotPayload } from "@/lib/terminal/api-demo";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json({ error: "Missing market id" }, { status: 400 });
  }

  try {
    await userFromRequest(request);
    const market = await fetchGammaMarket(id);
    const yes = getYesTokenFromMarket(market);
    if (!yes) {
      return Response.json({ error: "No YES token for market" }, { status: 422 });
    }

    const [spread, midpoint, history, eventContext] = await Promise.all([
      fetchSpread(yes),
      fetchMidpoint(yes),
      fetchYesPriceHistory(yes),
      resolveMarketEventContext(market),
    ]);
    const no = getNoTokenFromMarket(market);
    const jump = detectLargestJumpPoint(history, { minMoveCents: 0.25 });

    let yesPrice: number | null = null;
    let noPrice: number | null = null;
    if (market.outcomePrices) {
      try {
        const arr = JSON.parse(market.outcomePrices) as unknown;
        if (Array.isArray(arr)) {
          const y = Number(arr[0]);
          const n = Number(arr[1]);
          yesPrice = Number.isFinite(y) ? y : null;
          noPrice = Number.isFinite(n) ? n : null;
        }
      } catch {
        // ignore
      }
    }

    return Response.json({
      id: market.id,
      question: market.question,
      conditionId: market.conditionId ?? null,
      slug: market.slug ?? null,
      eventSlug: eventContext.eventSlug,
      eventTitle: eventContext.eventTitle,
      polymarketUrl: eventContext.polymarketUrl,
      category: market.category ?? null,
      yesTokenId: yes,
      noTokenId: no,
      spread,
      midpoint,
      history,
      jump,
      outcomePrices: market.outcomePrices,
      yesPrice,
      noPrice,
      volume24hr: market.volume24hr ?? null,
      volume1wk: market.volume1wk ?? null,
      liquidity: market.liquidityNum ?? (market.liquidity ? Number(market.liquidity) : null),
      endDate: market.endDate ?? null,
      createdAt: market.createdAt ?? null,
      dataMode: "real",
    });
  } catch (err) {
    if (err instanceof ResearchStoreError) return researchErrorResponse(err);
    if (process.env.SOLVOL_DISABLE_MOCK_FALLBACK !== "true") {
      const payload = await mockMarketSnapshotPayload(id);
      return Response.json({
        ...payload,
        dataMode: "mock",
        fallbackReason: err instanceof Error ? err.message : "Failed to load market",
      });
    }
    const message = err instanceof Error ? err.message : "Failed to load market";
    return Response.json({ error: message }, { status: 502 });
  }
}
