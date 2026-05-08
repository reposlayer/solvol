import type { GammaEventSummary, GammaMarket, PriceHistoryPoint, PricesHistoryResponse } from "./types";
import { TERMINAL_REFRESH } from "@/hooks/terminal-refresh";
import {
  normalizeDataApiTrades,
  normalizeOrderBook,
  type NormalizedOrderBook,
  type PublicMarketTrade,
} from "./market-intel";
import { buildPublicPolymarketUrl, parsePublicMidpoint } from "./public-api";
import { buildPolymarketMarketUrl } from "./links";
import { noTokenId, yesTokenId } from "./tokens";

export type MarketEventContext = {
  eventSlug: string | null;
  eventTitle: string | null;
  polymarketUrl: string;
};

export async function fetchGammaMarket(marketId: string): Promise<GammaMarket> {
  const res = await fetch(
    buildPublicPolymarketUrl("gamma", `/markets/${encodeURIComponent(marketId)}`),
    { next: { revalidate: TERMINAL_REFRESH.snapshot.marketRevalidateSeconds } },
  );
  if (!res.ok) {
    throw new Error(`Gamma markets/${marketId}: ${res.status}`);
  }
  return res.json() as Promise<GammaMarket>;
}

function eventContextFromEvent(market: GammaMarket, event: GammaEventSummary | null | undefined): MarketEventContext {
  const eventSlug = event?.slug ?? null;
  const eventTitle = event?.title ?? null;
  return {
    eventSlug,
    eventTitle,
    polymarketUrl: buildPolymarketMarketUrl({
      eventSlug,
      question: market.question,
      marketSlug: market.slug,
      id: market.id,
    }),
  };
}

export function eventContextFromMarket(market: GammaMarket): MarketEventContext {
  return eventContextFromEvent(
    market,
    market.events?.find((event) => event?.slug || event?.title),
  );
}

export async function resolveMarketEventContext(market: GammaMarket): Promise<MarketEventContext> {
  const direct = eventContextFromMarket(market);
  if (direct.eventSlug) return direct;

  try {
    const res = await fetch(
      buildPublicPolymarketUrl("gamma", "/public-search", {
        q: market.question,
        limit: 8,
      }),
      { next: { revalidate: TERMINAL_REFRESH.snapshot.marketRevalidateSeconds } },
    );
    if (!res.ok) return direct;
    const data = (await res.json()) as { events?: GammaEventSummary[] };
    const events = Array.isArray(data.events) ? data.events : [];
    const matched =
      events.find((event) =>
        event.markets?.some((candidate) => String(candidate.id) === String(market.id)),
      ) ?? events[0];
    return eventContextFromEvent(market, matched);
  } catch {
    return direct;
  }
}

export async function fetchMidpoint(tokenId: string): Promise<number | null> {
  const res = await fetch(
    buildPublicPolymarketUrl("clob", "/midpoint", { token_id: tokenId }),
    { next: { revalidate: TERMINAL_REFRESH.snapshot.clobRevalidateSeconds } },
  );
  if (!res.ok) return null;
  return parsePublicMidpoint(await res.json());
}

export async function fetchSpread(tokenId: string): Promise<number | null> {
  const res = await fetch(
    buildPublicPolymarketUrl("clob", "/spread", { token_id: tokenId }),
    { next: { revalidate: TERMINAL_REFRESH.snapshot.clobRevalidateSeconds } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { spread?: string };
  const s = data.spread !== undefined ? Number(data.spread) : NaN;
  return Number.isFinite(s) ? s : null;
}

export async function fetchOrderBook(tokenId: string): Promise<NormalizedOrderBook | null> {
  const res = await fetch(
    buildPublicPolymarketUrl("clob", "/book", { token_id: tokenId }),
    { next: { revalidate: TERMINAL_REFRESH.intel.orderBookRevalidateSeconds } },
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
  const res = await fetch(buildPublicPolymarketUrl("data", "/trades", params), {
    next: { revalidate: TERMINAL_REFRESH.intel.tradesRevalidateSeconds },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return normalizeDataApiTrades(data);
}

async function fetchPricesHistoryRaw(params: Record<string, string>): Promise<PricesHistoryResponse> {
  const res = await fetch(buildPublicPolymarketUrl("clob", "/prices-history", params), {
    next: { revalidate: TERMINAL_REFRESH.snapshot.historyRevalidateSeconds },
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
