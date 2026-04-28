import { momentumScoreBonus } from "./clob-momentum";
import type { GammaMarket } from "./types";

function volumeSpikeRatio(m: GammaMarket): number {
  const volume24hr = m.volume24hr ?? 0;
  const volume1wk = m.volume1wk ?? 0;
  const dailyAvg = volume1wk > 0 ? volume1wk / 7 : volume24hr;
  return dailyAvg > 0 ? volume24hr / dailyAvg : 1;
}

function liquidityNum(m: GammaMarket): number {
  const n = m.liquidityNum ?? Number(m.liquidity ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Base Terminal composite score (Gamma-only, before CLOB momentum). */
export function baseTerminalHotScore(m: GammaMarket): number {
  const volume24hr = m.volume24hr ?? 0;
  const spike = volumeSpikeRatio(m);
  const competitive = typeof m.competitive === "number" ? m.competitive : 0;
  const featured = Boolean(m.featured);
  const liq = liquidityNum(m);
  const vol = Math.log10(volume24hr + 1) * 12;
  const spikeC = Math.min(spike, 8) * 4;
  const comp = competitive * 18;
  const feat = featured ? 10 : 0;
  const liqS = Math.log10(liq + 1) * 2;
  return vol + spikeC + comp + feat + liqS;
}

export function terminalScoreWithMomentum(
  base: number,
  movePct: number | null | undefined,
): number {
  const bonus =
    movePct != null && Number.isFinite(movePct) ? momentumScoreBonus(movePct) : 0;
  return base + bonus;
}
