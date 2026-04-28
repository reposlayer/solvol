"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoveryLane, DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import {
  DISCOVERY_DEFAULT_CLOSING_HOURS,
  DISCOVERY_DEFAULT_LIMIT,
} from "@/hooks/discovery-url";

export type TerminalDiscoveryOpts = {
  limit?: number;
  tagId?: string | null;
  /** Closing-soon horizon (hours); sent to API; included in cache key. */
  hours?: number;
};

export const discoveryQueryKey = (lane: DiscoveryLane, opts?: TerminalDiscoveryOpts) =>
  [
    "discovery",
    lane,
    opts?.tagId ?? "",
    opts?.limit ?? DISCOVERY_DEFAULT_LIMIT,
    opts?.hours ?? DISCOVERY_DEFAULT_CLOSING_HOURS,
  ] as const;

function buildDiscoveryUrl(lane: DiscoveryLane, opts?: TerminalDiscoveryOpts): string {
  const sp = new URLSearchParams();
  sp.set("lane", lane);
  const limit = opts?.limit ?? DISCOVERY_DEFAULT_LIMIT;
  sp.set("limit", String(limit));
  const hours = opts?.hours ?? DISCOVERY_DEFAULT_CLOSING_HOURS;
  if (hours !== DISCOVERY_DEFAULT_CLOSING_HOURS) {
    sp.set("hours", String(hours));
  }
  if (opts?.tagId) sp.set("tag_id", opts.tagId);
  return `/api/discovery?${sp.toString()}`;
}

async function fetchDiscovery(
  lane: DiscoveryLane,
  opts?: TerminalDiscoveryOpts,
): Promise<DiscoveryMarketRow[]> {
  const res = await fetch(buildDiscoveryUrl(lane, opts));
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Discovery failed");
  }
  return data.items as DiscoveryMarketRow[];
}

/** Shared discovery query for scanner + tape (deduped by React Query). */
export function useTerminalDiscovery(lane: DiscoveryLane, opts?: TerminalDiscoveryOpts) {
  return useQuery({
    queryKey: discoveryQueryKey(lane, opts),
    queryFn: () => fetchDiscovery(lane, opts),
    staleTime: 45_000,
    refetchInterval: 90_000,
  });
}

export function useInvalidateDiscovery() {
  const qc = useQueryClient();
  return (lane: DiscoveryLane) =>
    qc.invalidateQueries({ queryKey: ["discovery", lane] });
}
