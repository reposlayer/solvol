import type { SourceDocument } from "../domain/types";

const ALPHA_VANTAGE_API = "https://www.alphavantage.co/query";
const ALPHA_VANTAGE_RELIABILITY = 0.76;

const SYMBOL_TERMS: Record<string, string[]> = {
  AAPL: ["apple", "aapl"],
  AMZN: ["amazon", "amzn"],
  GOOGL: ["google", "alphabet", "googl"],
  META: ["meta", "facebook"],
  MSFT: ["microsoft", "msft"],
  NVDA: ["nvidia", "nvda"],
  QQQ: ["nasdaq", "qqq"],
  SPY: ["s&p", "spy", "sp500", "s&p 500"],
  TSLA: ["tesla", "tsla"],
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function finite(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function alphaSymbolsForTerms(terms: string[]): string[] {
  const hay = terms.join(" ").toLowerCase();
  return Object.entries(SYMBOL_TERMS)
    .filter(([symbol, needles]) => hay.includes(symbol.toLowerCase()) || needles.some((needle) => hay.includes(needle)))
    .map(([symbol]) => symbol);
}

export function normalizeAlphaVantageDaily(
  symbol: string,
  payload: unknown,
  matchedTerms: string[],
): SourceDocument[] {
  const root = asRecord(payload);
  const daily = asRecord(root?.["Time Series (Daily)"]);
  if (!daily) return [];
  const retrievedAt = new Date().toISOString();

  return Object.entries(daily)
    .slice(0, 1)
    .map(([date, value]): SourceDocument | null => {
      const row = asRecord(value);
      if (!row) return null;
      const open = finite(row["1. open"]);
      const close = finite(row["4. close"]);
      const volume = finite(row["5. volume"]);
      if (close == null) return null;
      return {
        provider: "alpha_vantage",
        externalId: `${symbol}:${date}`,
        title: `${symbol} daily close`,
        url: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}`,
        publishedAt: `${date}T00:00:00.000Z`,
        retrievedAt,
        summary: `${symbol} closed at ${close}${open != null ? ` after opening at ${open}` : ""}.`,
        category: "price_feed",
        matchedTerms,
        reliability: ALPHA_VANTAGE_RELIABILITY,
        metadata: { symbol, open, close, volume },
      } satisfies SourceDocument;
    })
    .filter((doc): doc is SourceDocument => doc !== null);
}

export async function fetchAlphaVantageSources(terms: string[]): Promise<SourceDocument[]> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];
  const symbols = alphaSymbolsForTerms(terms).slice(0, 4);
  const batches = await Promise.all(
    symbols.map(async (symbol) => {
      const params = new URLSearchParams({
        function: "TIME_SERIES_DAILY",
        symbol,
        outputsize: "compact",
        apikey: key,
      });
      const res = await fetch(`${ALPHA_VANTAGE_API}?${params.toString()}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) return [] as SourceDocument[];
      return normalizeAlphaVantageDaily(symbol, await res.json(), terms);
    }),
  );
  return batches.flat();
}
