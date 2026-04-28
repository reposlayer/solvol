"use client";

import { useQuery } from "@tanstack/react-query";

export type MarketSnapshotPayload = {
  id: string;
  question: string;
  slug: string | null;
  spread: number | null;
  midpoint: number | null;
  history: { t: number; p: number }[];
  yesPrice: number | null;
  noPrice: number | null;
  volume24hr: number | null;
  volume1wk: number | null;
  liquidity: number | null;
  endDate: string | null;
  createdAt: string | null;
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
    staleTime: 45_000,
  });
}
