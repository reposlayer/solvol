"use client";

import { useQuery } from "@tanstack/react-query";
import { TERMINAL_REFRESH } from "@/hooks/terminal-refresh";
import type { JumpPoint } from "@/lib/polymarket/market-intel";

export type MarketSnapshotPayload = {
  id: string;
  question: string;
  conditionId: string | null;
  slug: string | null;
  eventSlug: string | null;
  eventTitle: string | null;
  polymarketUrl: string;
  category: string | null;
  yesTokenId: string;
  noTokenId: string | null;
  spread: number | null;
  midpoint: number | null;
  history: { t: number; p: number }[];
  jump: JumpPoint | null;
  outcomePrices?: string;
  yesPrice: number | null;
  noPrice: number | null;
  volume24hr: number | null;
  volume1wk: number | null;
  liquidity: number | null;
  endDate: string | null;
  createdAt: string | null;
  dataMode?: "real" | "mock";
  fallbackReason?: string;
};

export function marketSnapshotQueryKey(marketId: string) {
  return ["market", marketId, "snapshot"] as const;
}

export function useMarketSnapshot(marketId: string) {
  return useQuery({
    queryKey: marketSnapshotQueryKey(marketId),
    queryFn: async (): Promise<MarketSnapshotPayload> => {
      const res = await fetch(`/api/market/${encodeURIComponent(marketId)}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Load failed");
      }
      return json as MarketSnapshotPayload;
    },
    staleTime: TERMINAL_REFRESH.snapshot.staleTimeMs,
    refetchInterval: TERMINAL_REFRESH.snapshot.refetchIntervalMs,
    refetchIntervalInBackground: true,
  });
}
