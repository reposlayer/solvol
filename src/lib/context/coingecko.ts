import type { CryptoWindowStats } from "@/lib/domain/types";
import type { SourceDocument } from "@/lib/domain/types";
import { sourceReliability } from "@/lib/context/source-documents";

const COINGECKO = "https://api.coingecko.com/api/v3";

export const COINGECKO_SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
};

export async function fetchCryptoWindowChange(
  ticker: string,
  windowStartSec: number,
  windowEndSec: number,
): Promise<CryptoWindowStats | null> {
  const id = COINGECKO_SYMBOL_MAP[ticker.toUpperCase()];
  if (!id) return null;

  const from = Math.floor(windowStartSec);
  const to = Math.ceil(windowEndSec);
  const url = `${COINGECKO}/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;

  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) return null;

  const data = (await res.json()) as { prices?: [number, number][] };
  const prices = data.prices ?? [];
  if (prices.length < 2) return null;

  const start = prices[0]![1];
  const end = prices[prices.length - 1]![1];
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return null;

  const changePercent = ((end - start) / start) * 100;

  return {
    assetId: id,
    symbol: ticker.toUpperCase(),
    priceStartUsd: start,
    priceEndUsd: end,
    changePercent,
  };
}

export function cryptoTickersForTerms(terms: string[]): string[] {
  const hay = terms.join(" ").toLowerCase();
  return Object.keys(COINGECKO_SYMBOL_MAP).filter((symbol) => {
    const id = COINGECKO_SYMBOL_MAP[symbol]!;
    return hay.includes(symbol.toLowerCase()) || hay.includes(id);
  });
}

export function sourceDocumentFromCryptoStats(
  stats: CryptoWindowStats,
  windowStartIso: string,
  windowEndIso: string,
  matchedTerms: string[],
): SourceDocument {
  return {
    provider: "coingecko",
    externalId: `${stats.assetId}:${windowStartIso}:${windowEndIso}`,
    title: `${stats.symbol} spot move (${stats.changePercent >= 0 ? "+" : ""}${stats.changePercent.toFixed(2)}%)`,
    url: `https://www.coingecko.com/en/coins/${encodeURIComponent(stats.assetId)}`,
    publishedAt: windowEndIso,
    retrievedAt: new Date().toISOString(),
    summary: `${stats.symbol} moved ${stats.changePercent.toFixed(2)}% over the sampled window.`,
    category: "price_feed",
    matchedTerms,
    reliability: sourceReliability("coingecko"),
    metadata: {
      assetId: stats.assetId,
      symbol: stats.symbol,
      priceStartUsd: stats.priceStartUsd,
      priceEndUsd: stats.priceEndUsd,
      changePercent: stats.changePercent,
      windowStartIso,
      windowEndIso,
    },
  };
}

export async function fetchCoinGeckoSourceDocuments(
  terms: string[],
  windowStartSec: number,
  windowEndSec: number,
): Promise<SourceDocument[]> {
  const tickers = cryptoTickersForTerms(terms);
  const docs: SourceDocument[] = [];
  for (const ticker of tickers) {
    const stats = await fetchCryptoWindowChange(ticker, windowStartSec, windowEndSec);
    if (!stats) continue;
    docs.push(
      sourceDocumentFromCryptoStats(
        stats,
        new Date(windowStartSec * 1000).toISOString(),
        new Date(windowEndSec * 1000).toISOString(),
        terms,
      ),
    );
  }
  return docs;
}
