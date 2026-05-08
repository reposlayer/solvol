export const TERMINAL_REFRESH = {
  discovery: {
    staleTimeMs: 12_000,
    refetchIntervalMs: 25_000,
    serverRevalidateSeconds: 25,
  },
  snapshot: {
    staleTimeMs: 6_000,
    refetchIntervalMs: 12_000,
    marketRevalidateSeconds: 15,
    clobRevalidateSeconds: 5,
    historyRevalidateSeconds: 30,
  },
  intel: {
    staleTimeMs: 8_000,
    refetchIntervalMs: 15_000,
    orderBookRevalidateSeconds: 5,
    tradesRevalidateSeconds: 10,
  },
  feed: {
    staleTimeMs: 45_000,
    refetchIntervalMs: 60_000,
  },
} as const;
