import { fetchNewsArticles } from "@/lib/context/rss";
import {
  fetchGammaMarket,
  fetchMarketTrades,
  fetchOrderBook,
  fetchYesPriceHistory,
  getNoTokenFromMarket,
  getYesTokenFromMarket,
} from "@/lib/polymarket/client";
import {
  deriveNewsTerms,
  detectLargestJumpPoint,
  summarizeOrderBook,
} from "@/lib/polymarket/market-intel";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "35", 10);

  if (!id?.trim()) {
    return Response.json({ error: "Missing market id" }, { status: 400 });
  }

  try {
    const market = await fetchGammaMarket(id);
    const yesTokenId = getYesTokenFromMarket(market);
    const noTokenId = getNoTokenFromMarket(market);
    if (!yesTokenId) {
      return Response.json({ error: "No YES token for market" }, { status: 422 });
    }

    const terms = deriveNewsTerms(market.question, market.description);
    const [book, trades, history, news] = await Promise.all([
      fetchOrderBook(yesTokenId),
      fetchMarketTrades(market.conditionId, Number.isFinite(limit) ? limit : 35),
      fetchYesPriceHistory(yesTokenId),
      fetchNewsArticles(terms, { limit: 36 }),
    ]);

    const orderBook = book
      ? {
          raw: book,
          summary: summarizeOrderBook(book, 10),
        }
      : null;

    return Response.json({
      id: market.id,
      question: market.question,
      slug: market.slug ?? null,
      conditionId: market.conditionId ?? null,
      category: market.category ?? null,
      yesTokenId,
      noTokenId,
      orderBook,
      trades,
      news,
      newsTerms: terms,
      jump: detectLargestJumpPoint(history, { minMoveCents: 0.25 }),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load market intel";
    return Response.json({ error: message }, { status: 502 });
  }
}
