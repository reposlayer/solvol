import { MOCK_POLYMARKET_MARKETS } from "./mockData.ts";
import type { GammaMarket, NormalizedPolymarketMarket } from "./types.ts";

export const POLYMARKET_GAMMA_MARKETS_URL = "https://gamma-api.polymarket.com/markets";

type PolymarketMarketFetchOptions = {
  limit?: number;
  query?: string;
  signal?: AbortSignal;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseOutcomePrices(raw: GammaMarket): { yesPrice: number; noPrice: number } {
  try {
    const prices = JSON.parse(raw.outcomePrices ?? "[]") as unknown;
    if (Array.isArray(prices) && prices.length >= 2) {
      const yesPrice = asNumber(prices[0], 0.5);
      const noPrice = asNumber(prices[1], 1 - yesPrice);
      return { yesPrice, noPrice };
    }
  } catch {
    // Fall through to neutral pricing.
  }
  return { yesPrice: 0.5, noPrice: 0.5 };
}

function clampPrice(value: number): number {
  return Math.max(0.01, Math.min(0.99, Math.round(value * 100) / 100));
}

function syntheticSparkline(yesPrice: number, volume: number): number[] {
  const drift = Math.min(0.08, Math.max(-0.08, (volume % 17) / 100 - 0.08));
  return Array.from({ length: 7 }, (_, index) => clampPrice(yesPrice - drift + index * (drift / 3)));
}

function emptyOrderBook(): NormalizedPolymarketMarket["orderBook"] {
  return {
    yesBids: [],
    yesAsks: [],
    noBids: [],
    noAsks: [],
  };
}

export function normalizePolymarketMarket(raw: GammaMarket): NormalizedPolymarketMarket {
  const { yesPrice, noPrice } = parseOutcomePrices(raw);
  const volume24h = asNumber(raw.volume24hr, asNumber(raw.volumeNum, asNumber(raw.volume)));
  const liquidity = asNumber(raw.liquidityNum, asNumber(raw.liquidity));
  const event = raw.events?.[0];
  const id = String(raw.id);
  const title = raw.question || event?.title || raw.slug || `Market ${id}`;
  const category = raw.category || event?.category || "General";
  const endDate = raw.endDate || event?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const sparkline = syntheticSparkline(yesPrice, volume24h);
  const change24h = sparkline.length > 1 ? sparkline[sparkline.length - 1]! - sparkline[0]! : 0;

  return {
    id,
    slug: raw.slug || event?.slug || id,
    title,
    category,
    yesPrice: clampPrice(yesPrice),
    noPrice: clampPrice(noPrice),
    volume24h,
    liquidity,
    change24h,
    endDate,
    sparkline,
    orderBook: emptyOrderBook(),
    trades: [],
    description: raw.description || event?.description || "Public Polymarket market normalized for terminal display.",
    resolutionSource: "Polymarket public market page and resolution criteria.",
    status: raw.closed ? "closed" : "open",
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchPolymarketMarkets({
  limit = 80,
  query,
  signal,
}: PolymarketMarketFetchOptions = {}): Promise<NormalizedPolymarketMarket[]> {
  const url = new URL(POLYMARKET_GAMMA_MARKETS_URL);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", String(limit));
  if (query?.trim()) url.searchParams.set("q", query.trim());

  const response = await fetch(url, {
    signal,
    headers: {
      accept: "application/json",
    },
    next: { revalidate: 45 },
  });
  if (!response.ok) throw new Error(`Polymarket read failed: ${response.status}`);
  const payload = (await response.json()) as unknown;
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((row) => normalizePolymarketMarket(row as GammaMarket));
}

export async function fetchPolymarketMarketsWithFallback(
  options: PolymarketMarketFetchOptions = {},
): Promise<{ readOnly: true; mode: "real" | "mock"; markets: NormalizedPolymarketMarket[]; error?: string }> {
  try {
    const markets = await fetchPolymarketMarkets(options);
    if (markets.length === 0) {
      return {
        readOnly: true,
        mode: "mock",
        markets: MOCK_POLYMARKET_MARKETS,
        error: "No live Polymarket markets returned; deterministic mock fallback is active.",
      };
    }
    return {
      readOnly: true,
      mode: "real",
      markets,
    };
  } catch (error) {
    return {
      readOnly: true,
      mode: "mock",
      markets: MOCK_POLYMARKET_MARKETS,
      error: error instanceof Error ? error.message : "Polymarket read failed",
    };
  }
}
