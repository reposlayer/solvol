"use client";

import { useQuery } from "@tanstack/react-query";
import { TERMINAL_REFRESH } from "@/hooks/terminal-refresh";
import type {
  JumpPoint,
  NormalizedOrderBook,
  OrderBookSummary,
  PublicMarketTrade,
} from "@/lib/polymarket/market-intel";
import type { ExternalArticle, SourceDocument } from "@/lib/domain/types";
import type {
  AlertEvent,
  AlertRule,
  DataSourceStatus,
  EventItem,
  MarketMove,
  MarketScores,
  MarketSourceStatus,
  MoveCorrelation,
  NewsItem,
  WalletActivity,
  WhyMovedCandidate,
} from "@/lib/terminal/types";
import type { MarketPriceRecord, MarketRegistryRecord } from "@/lib/terminal/market-registry";
import type { PersistIngestionBridgeResult } from "@/lib/terminal/persistence";

export type MarketIntelPayload = {
  id: string;
  question: string;
  slug: string | null;
  eventSlug?: string | null;
  eventTitle?: string | null;
  polymarketUrl?: string;
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
  sources: SourceDocument[];
  newsTerms: string[];
  jump: JumpPoint | null;
  fetchedAt: string;
  dataMode?: "real" | "mock";
  fallbackReason?: string;
  events?: EventItem[];
  walletActivity?: WalletActivity[];
  moves?: MarketMove[];
  marketRegistry?: MarketRegistryRecord[];
  marketPrice?: MarketPriceRecord[];
  alertRules?: AlertRule[];
  alertEvents?: AlertEvent[];
  sourceStatus?: MarketSourceStatus;
  sourceHealth?: DataSourceStatus[];
  scores?: MarketScores;
  correlations?: MoveCorrelation[];
  normalizedNews?: NewsItem[];
  eventClusters?: EventItem[];
  whyMovedCandidates?: WhyMovedCandidate[];
  persistence?: PersistIngestionBridgeResult;
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
    staleTime: TERMINAL_REFRESH.intel.staleTimeMs,
    refetchInterval: TERMINAL_REFRESH.intel.refetchIntervalMs,
    refetchIntervalInBackground: true,
  });
}
