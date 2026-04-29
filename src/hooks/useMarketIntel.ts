"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  JumpPoint,
  NormalizedOrderBook,
  OrderBookSummary,
  PublicMarketTrade,
} from "@/lib/polymarket/market-intel";
import type { ExternalArticle } from "@/lib/domain/types";

export type MarketIntelPayload = {
  id: string;
  question: string;
  slug: string | null;
  conditionId: string | null;
  category: string | null;
  yesTokenId: string;
  noTokenId: string | null;
  orderBook: {
    raw: NormalizedOrderBook;
    summary: OrderBookSummary;
  } | null;
  trades: PublicMarketTrade[];
  news: ExternalArticle[];
  newsTerms: string[];
  jump: JumpPoint | null;
  fetchedAt: string;
};

export function marketIntelQueryKey(marketId: string | null | undefined) {
  return ["market", marketId ?? "none", "intel"] as const;
}

export function useMarketIntel(marketId: string | null | undefined) {
  return useQuery({
    queryKey: marketIntelQueryKey(marketId),
    enabled: Boolean(marketId),
    queryFn: async (): Promise<MarketIntelPayload> => {
      const res = await fetch(`/api/market/${encodeURIComponent(marketId ?? "")}/intel`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Intel load failed");
      }
      return json as MarketIntelPayload;
    },
    staleTime: 30_000,
    refetchInterval: 90_000,
  });
}
