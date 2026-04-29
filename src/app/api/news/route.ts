import { fetchNewsArticles } from "@/lib/context/rss";
import { fetchGammaMarket } from "@/lib/polymarket/client";
import { deriveNewsTerms } from "@/lib/polymarket/market-intel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const marketId = url.searchParams.get("marketId")?.trim();
  const q = url.searchParams.get("q")?.trim();
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "40", 10);

  try {
    let terms = q
      ? q.split(/[,\s]+/).map((term) => term.trim()).filter(Boolean)
      : [];
    let market: { id: string; question: string; slug: string | null } | null = null;

    if (marketId) {
      const gamma = await fetchGammaMarket(marketId);
      market = {
        id: gamma.id,
        question: gamma.question,
        slug: gamma.slug ?? null,
      };
      terms = Array.from(new Set([...deriveNewsTerms(gamma.question, gamma.description), ...terms]));
    }

    const items = await fetchNewsArticles(terms, {
      limit: Number.isFinite(limit) ? limit : 40,
    });

    return Response.json({
      items,
      terms,
      market,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load news";
    return Response.json({ error: message }, { status: 502 });
  }
}
