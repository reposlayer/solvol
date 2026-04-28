import {
  fetchGammaMarket,
  fetchMidpoint,
  fetchSpread,
  fetchYesPriceHistory,
  getYesTokenFromMarket,
} from "@/lib/polymarket/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json({ error: "Missing market id" }, { status: 400 });
  }

  try {
    const market = await fetchGammaMarket(id);
    const yes = getYesTokenFromMarket(market);
    if (!yes) {
      return Response.json({ error: "No YES token for market" }, { status: 422 });
    }

    const [spread, midpoint, history] = await Promise.all([
      fetchSpread(yes),
      fetchMidpoint(yes),
      fetchYesPriceHistory(yes),
    ]);

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
      slug: market.slug ?? null,
      spread,
      midpoint,
      history,
      outcomePrices: market.outcomePrices,
      yesPrice,
      noPrice,
      volume24hr: market.volume24hr ?? null,
      volume1wk: market.volume1wk ?? null,
      liquidity: market.liquidityNum ?? (market.liquidity ? Number(market.liquidity) : null),
      endDate: market.endDate ?? null,
      createdAt: market.createdAt ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load market";
    return Response.json({ error: message }, { status: 502 });
  }
}
