import type { PricesHistoryResponse } from "./types";

const CLOB_BASE = "https://clob.polymarket.com";

/** Last step move % on YES implied probability (coarse CLOB series). */
export async function fetchYesShortMomentumPct(yesTokenId: string): Promise<number | null> {
  const params = new URLSearchParams({
    market: yesTokenId,
    interval: "max",
    fidelity: "720",
  });
  const res = await fetch(`${CLOB_BASE}/prices-history?${params.toString()}`, {
    next: { revalidate: 60 },
  });
  const data = (await res.json()) as PricesHistoryResponse;
  if (data.error) return null;
  const h = data.history ?? [];
  if (h.length < 2) return null;
  const sorted = [...h].sort((a, b) => a.t - b.t);
  const prev = sorted[sorted.length - 2]!;
  const cur = sorted[sorted.length - 1]!;
  if (prev.p <= 0) return null;
  return ((cur.p - prev.p) / prev.p) * 100;
}

export function momentumScoreBonus(movePct: number): number {
  const mag = Math.min(Math.abs(movePct), 45);
  return mag * 0.22;
}
