import type {
  EventImpact,
  EventItem,
  Market,
  MarketMove,
  MarketScores,
  MoveCorrelation,
  MoveCorrelationMatch,
  WalletActivity,
} from "./types";

type ScoreContext = {
  eventCount?: number;
  whaleCount?: number;
  now?: string;
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function probabilityDeltaCents(before: number, after: number): number {
  return (after - before) * 100;
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moveDirection(move: MarketMove): EventImpact {
  if (move.probabilityAfter > move.probabilityBefore) return "up";
  if (move.probabilityAfter < move.probabilityBefore) return "down";
  return "neutral";
}

function eventAligns(direction: EventImpact, item: EventItem): boolean {
  return item.impact === direction || item.impact === "neutral";
}

function walletAligns(direction: EventImpact, wallet: WalletActivity): boolean {
  const outcome = wallet.outcome.toUpperCase();
  if (direction === "up") {
    return (outcome === "YES" && wallet.side === "BUY") || (outcome === "NO" && wallet.side === "SELL");
  }
  if (direction === "down") {
    return (outcome === "NO" && wallet.side === "BUY") || (outcome === "YES" && wallet.side === "SELL");
  }
  return true;
}

export function scoreVolatility(history: Market["priceHistory"]): number {
  if (history.length < 2) return 0;
  const deltas = history.slice(1).map((point, index) =>
    Math.abs(probabilityDeltaCents(history[index]!.probability, point.probability)),
  );
  const averageCents = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const maxCents = Math.max(...deltas);
  return clampScore(averageCents * 6 + maxCents * 3);
}

export function scoreMomentum(history: Market["priceHistory"]): number {
  if (history.length < 2) return 0;
  const first = history[0]!.probability;
  const last = history[history.length - 1]!.probability;
  const netCents = Math.abs(probabilityDeltaCents(first, last));
  const directionalConsistency = history.slice(1).reduce((score, point, index) => {
    const delta = point.probability - history[index]!.probability;
    if (delta === 0) return score;
    const expected = last >= first ? delta > 0 : delta < 0;
    return score + (expected ? 1 : -0.5);
  }, 0);
  const consistencyBoost = Math.max(0, directionalConsistency) * 7;
  return clampScore(netCents * 5 + consistencyBoost);
}

export function scoreUnusualVolume(volume24h: number, volume7d: number): number {
  const baselineDaily = volume7d > 0 ? volume7d / 7 : volume24h;
  if (baselineDaily <= 0) return 0;
  const ratio = volume24h / baselineDaily;
  return clampScore((ratio - 0.75) * 28 + Math.log10(volume24h + 1) * 5);
}

export function scoreWhaleConviction(activity: WalletActivity): number {
  const notionalScore = Math.log10(Math.max(1, activity.notionalUsd)) * 18;
  const sizeScore = Math.log10(Math.max(1, activity.size)) * 4;
  const sideScore = activity.side === "BUY" ? 4 : 0;
  return clampScore(notionalScore + sizeScore + sideScore);
}

export function scoreMoveSignificance(move: MarketMove): number {
  const absCents = Math.abs(probabilityDeltaCents(move.probabilityBefore, move.probabilityAfter));
  const speedScore = move.windowMinutes > 0 ? Math.min(18, 360 / move.windowMinutes) : 0;
  const volumeScore = Math.log10(move.volumeUsd + 1) * 6;
  return clampScore(absCents * 5 + speedScore + volumeScore);
}

export function scoreMarketSignals(market: Market, context: ScoreContext = {}): MarketScores {
  const volatilityScore = scoreVolatility(market.priceHistory);
  const momentumScore = scoreMomentum(market.priceHistory);
  const unusualVolumeScore = scoreUnusualVolume(market.volume24h, market.volume7d);
  const whaleConvictionScore = clampScore((context.whaleCount ?? 0) * 18);
  const liquidityScore = clampScore(Math.log10(market.liquidity + 1) * 10);
  const sourceScore = clampScore((context.eventCount ?? 0) * 11);
  const openInterestScore = clampScore(Math.log10((market.openInterest ?? 0) + 1) * 7);

  const importanceScore = clampScore(
    volatilityScore * 0.18 +
      momentumScore * 0.2 +
      unusualVolumeScore * 0.22 +
      whaleConvictionScore * 0.13 +
      liquidityScore * 0.14 +
      sourceScore * 0.08 +
      openInterestScore * 0.05,
  );

  return {
    volatilityScore,
    momentumScore,
    unusualVolumeScore,
    whaleConvictionScore,
    importanceScore,
  };
}

export function correlateMoveCauses(
  move: MarketMove,
  events: EventItem[],
  wallets: WalletActivity[],
): MoveCorrelation {
  const direction = moveDirection(move);
  const moveTime = parseTime(move.timestamp);
  const windowMs = Math.max(1, move.windowMinutes) * 60 * 1000;

  const walletMatches: MoveCorrelationMatch[] = wallets
    .filter((wallet) => !wallet.marketId || wallet.marketId === move.marketId)
    .map((wallet): MoveCorrelationMatch | null => {
      const delta = Math.abs(parseTime(wallet.timestamp) - moveTime);
      if (delta > windowMs) return null;
      const timeScore = 100 * (1 - delta / windowMs);
      const conviction = scoreWhaleConviction(wallet);
      const alignmentBoost = walletAligns(direction, wallet) ? 16 : -18;
      const score = clampScore(timeScore * 0.5 + conviction * 0.38 + alignmentBoost);
      return {
        itemId: wallet.id,
        kind: "wallet" as const,
        title: `${wallet.label ?? wallet.walletAddress.slice(0, 8)} ${wallet.side} ${wallet.outcome}`,
        timestamp: wallet.timestamp,
        score,
        reason: `${Math.round(delta / 60000)}m from move, ${wallet.outcome} ${wallet.side}, ${Math.round(conviction)} wallet conviction`,
      };
    })
    .filter((match): match is MoveCorrelationMatch => match !== null && match.score >= 50);

  const eventMatches: MoveCorrelationMatch[] = events
    .filter((event) => !event.marketId || event.marketId === move.marketId)
    .map((event): MoveCorrelationMatch | null => {
      const delta = Math.abs(parseTime(event.timestamp) - moveTime);
      if (delta > windowMs) return null;
      const timeScore = 100 * (1 - delta / windowMs);
      const alignmentBoost = eventAligns(direction, event) ? 12 : -14;
      const sourcePenalty = event.source.kind === "mock" ? -6 : 0;
      const score = clampScore(timeScore * 0.58 + event.importance * 0.34 + alignmentBoost + sourcePenalty);
      return {
        itemId: event.id,
        kind: "event" as const,
        title: event.title,
        timestamp: event.timestamp,
        score,
        reason: `${Math.round(delta / 60000)}m from move, ${event.impact} impact, ${event.source.label}`,
      };
    })
    .filter((match): match is MoveCorrelationMatch => match !== null && match.score >= 50);

  const matches = [...walletMatches, ...eventMatches]
    .sort((a, b) => b.score - a.score || parseTime(b.timestamp) - parseTime(a.timestamp))
    .slice(0, 8);

  const score = clampScore(matches.reduce((sum, match) => sum + match.score, 0) / Math.max(1, matches.length));
  const summary =
    matches.length > 0
      ? `${matches.length} deterministic matches around a ${direction} move.`
      : `No deterministic matches inside the ${move.windowMinutes}m move window.`;

  return {
    moveId: move.id,
    direction,
    score,
    summary,
    matches,
  };
}
