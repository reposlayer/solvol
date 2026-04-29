import type { GammaMarket, PriceHistoryPoint, PricesHistoryResponse } from "./types";
import {
  normalizeDataApiTrades,
  normalizeOrderBook,
  type NormalizedOrderBook,
  type PublicMarketTrade,
} from "./market-intel";
import { noTokenId, yesTokenId } from "./tokens";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";
const DATA_BASE = "https://data-api.polymarket.com";

export async function fetchGammaMarket(marketId: string): Promise<GammaMarket> {
  const res = await fetch(`${GAMMA_BASE}/markets/${encodeURIComponent(marketId)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Gamma markets/${marketId}: ${res.status}`);
  }
  return res.json() as Promise<GammaMarket>;
}

export async function fetchMidpoint(tokenId: string): Promise<number | null> {
  const res = await fetch(
    `${CLOB_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`,
    { next: { revalidate: 30 } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { mid?: string };
  const mid = data.mid !== undefined ? Number(data.mid) : NaN;
  return Number.isFinite(mid) ? mid : null;
}

export async function fetchSpread(tokenId: string): Promise<number | null> {
  const res = await fetch(
    `${CLOB_BASE}/spread?token_id=${encodeURIComponent(tokenId)}`,
    { next: { revalidate: 30 } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { spread?: string };
  const s = data.spread !== undefined ? Number(data.spread) : NaN;
  return Number.isFinite(s) ? s : null;
}

export async function fetchOrderBook(tokenId: string): Promise<NormalizedOrderBook | null> {
  const res = await fetch(
    `${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`,
    { next: { revalidate: 15 } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return normalizeOrderBook(data);
}

export async function fetchMarketTrades(
  conditionId: string | null | undefined,
  limit = 40,
): Promise<PublicMarketTrade[]> {
  if (!conditionId) return [];
  const params = new URLSearchParams({
    market: conditionId,
    limit: String(Math.min(Math.max(limit, 1), 100)),
    takerOnly: "true",
  });
  const res = await fetch(`${DATA_BASE}/trades?${params.toString()}`, {
    next: { revalidate: 20 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return normalizeDataApiTrades(data);
}

async function fetchPricesHistoryRaw(params: Record<string, string>): Promise<PricesHistoryResponse> {
  const q = new URLSearchParams(params);
  const res = await fetch(`${CLOB_BASE}/prices-history?${q.toString()}`, {
    next: { revalidate: 120 },
  });
  const data = (await res.json()) as PricesHistoryResponse;
  return data;
}

/**
 * Pulls best-effort YES price history. Some tokens return sparse series unless `interval=max`.
 */
export async function fetchYesPriceHistory(yesTokenId: string): Promise<PriceHistoryPoint[]> {
  const attempts: Record<string, string>[] = [
    { market: yesTokenId, interval: "1w", fidelity: "30" },
    { market: yesTokenId, interval: "1w", fidelity: "60" },
    { market: yesTokenId, interval: "max", fidelity: "120" },
    { market: yesTokenId, interval: "max", fidelity: "1440" },
  ];

  let best: PriceHistoryPoint[] = [];
  for (const p of attempts) {
    const data = await fetchPricesHistoryRaw(p);
    if (data.error) continue;
    const h = data.history ?? [];
    if (h.length > best.length) best = h;
    if (h.length >= 10) break;
  }

  return best.sort((a, b) => a.t - b.t);
}

export function getYesTokenFromMarket(market: GammaMarket): string | null {
  return yesTokenId(market.clobTokenIds);
}

export function getNoTokenFromMarket(market: GammaMarket): string | null {
  return noTokenId(market.clobTokenIds);
}
