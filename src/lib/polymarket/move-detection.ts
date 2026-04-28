import type { PriceHistoryPoint } from "./types";
import type { MarketMoveWindow } from "@/lib/domain/types";

function iso(tsSec: number): string {
  return new Date(tsSec * 1000).toISOString();
}

/**
 * Finds the largest absolute single-step move in recent history (consecutive sample pairs).
 * Prices `p` are YES implied probability in [0, 1].
 */
export function detectLargestStepMove(
  history: PriceHistoryPoint[],
  opts?: { minAbsMovePercent?: number },
): MarketMoveWindow | null {
  const minAbs = opts?.minAbsMovePercent ?? 0.25;
  if (history.length < 2) return null;

  let bestI = 0;
  let bestAbsPct = -1;

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (prev.p <= 0) continue;
    const pct = ((cur.p - prev.p) / prev.p) * 100;
    const abs = Math.abs(pct);
    if (abs > bestAbsPct) {
      bestAbsPct = abs;
      bestI = i;
    }
  }

  if (bestAbsPct < minAbs) return null;

  const prev = history[bestI - 1];
  const cur = history[bestI];
  const movePct = prev.p > 0 ? ((cur.p - prev.p) / prev.p) * 100 : 0;

  const volumeMultiplierVs7dAvg = 1;

  return {
    windowStart: iso(prev.t),
    windowEnd: iso(cur.t),
    priceBefore: prev.p,
    priceAfter: cur.p,
    movePercent: movePct,
    baselineVolume24h: 0,
    volumeInWindowEstimate: 0,
    volumeMultiplierVs7dAvg,
  };
}
