"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoveryLane, DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import {
  DISCOVERY_DEFAULT_CLOSING_HOURS,
  DISCOVERY_DEFAULT_LIMIT,
} from "@/hooks/discovery-url";
import { TERMINAL_REFRESH } from "@/hooks/terminal-refresh";

export type TerminalDiscoveryOpts = {
  limit?: number;
  tagId?: string | null;
  offset?: number;
  query?: string | null;
  /** Closing-soon horizon (hours); sent to API; included in cache key. */
  hours?: number;
};

export type TerminalDiscoveryPayload = {
  lane: DiscoveryLane;
  fetchedAt: string;
  items: DiscoveryMarketRow[];
  dataMode?: "mock" | "real";
  fallbackReason?: string;
};

export const discoveryQueryKey = (lane: DiscoveryLane, opts?: TerminalDiscoveryOpts) =>
  [
    "discovery",
    lane,
    opts?.tagId ?? "",
    opts?.limit ?? DISCOVERY_DEFAULT_LIMIT,
    opts?.hours ?? DISCOVERY_DEFAULT_CLOSING_HOURS,
    opts?.offset ?? 0,
    opts?.query?.trim() ?? "",
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
  if (opts?.offset && opts.offset > 0) sp.set("offset", String(opts.offset));
  const query = opts?.query?.trim();
  if (query) sp.set("q", query);
  if (opts?.tagId) sp.set("tag_id", opts.tagId);
  return `/api/discovery?${sp.toString()}`;
}

async function fetchDiscovery(
  lane: DiscoveryLane,
  opts?: TerminalDiscoveryOpts,
): Promise<TerminalDiscoveryPayload> {
  const res = await fetch(buildDiscoveryUrl(lane, opts));
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Discovery failed");
  }
  return {
    lane: data.lane as DiscoveryLane,
    fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : new Date().toISOString(),
    items: Array.isArray(data.items) ? data.items as DiscoveryMarketRow[] : [],
    dataMode: data.dataMode === "mock" || data.dataMode === "real" ? data.dataMode : undefined,
    fallbackReason: typeof data.fallbackReason === "string" ? data.fallbackReason : undefined,
  };
}

/** Shared discovery query for scanner + tape (deduped by React Query). */
export function useTerminalDiscoveryPayload(lane: DiscoveryLane, opts?: TerminalDiscoveryOpts) {
  return useQuery({
    queryKey: discoveryQueryKey(lane, opts),
    queryFn: () => fetchDiscovery(lane, opts),
    staleTime: TERMINAL_REFRESH.discovery.staleTimeMs,
    refetchInterval: TERMINAL_REFRESH.discovery.refetchIntervalMs,
    refetchIntervalInBackground: true,
  });
}

/** Shared discovery query for scanner + tape (deduped by React Query). */
export function useTerminalDiscovery(lane: DiscoveryLane, opts?: TerminalDiscoveryOpts) {
  const query = useTerminalDiscoveryPayload(lane, opts);
  return {
    ...query,
    data: query.data?.items,
  };
}

export function useInvalidateDiscovery() {
  const qc = useQueryClient();
  return (lane: DiscoveryLane) =>
    qc.invalidateQueries({ queryKey: ["discovery", lane] });
}
