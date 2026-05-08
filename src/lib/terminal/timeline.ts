import type {
  EventItem,
  EventItemKind,
  MarketMove,
  MoveCorrelation,
  WalletActivity,
} from "./types";

export type TerminalTimelineEntry = {
  id: string;
  marketId: string | null;
  timestamp: string;
  kind: EventItemKind | "wallet";
  title: string;
  summary: string;
  sourceLabel: string;
  impact: "up" | "down" | "neutral";
  importance: number;
  correlationScore: number | null;
};

export type MergeTerminalTimelineInput = {
  events?: EventItem[];
  moves?: MarketMove[];
  walletActivity?: WalletActivity[];
  correlations?: MoveCorrelation[];
};

function cents(value: number): string {
  return `${(value * 100).toFixed(1)}c`;
}

function moveImpact(move: MarketMove): "up" | "down" | "neutral" {
  if (move.probabilityAfter > move.probabilityBefore) return "up";
  if (move.probabilityAfter < move.probabilityBefore) return "down";
  return "neutral";
}

function walletImpact(wallet: WalletActivity): "up" | "down" | "neutral" {
  const outcome = wallet.outcome.toUpperCase();
  if ((outcome === "YES" && wallet.side === "BUY") || (outcome === "NO" && wallet.side === "SELL")) {
    return "up";
  }
  if ((outcome === "NO" && wallet.side === "BUY") || (outcome === "YES" && wallet.side === "SELL")) {
    return "down";
  }
  return "neutral";
}

function matchScores(correlations: MoveCorrelation[] | undefined): Map<string, number> {
  const scores = new Map<string, number>();
  for (const correlation of correlations ?? []) {
    scores.set(correlation.moveId, Math.max(scores.get(correlation.moveId) ?? 0, correlation.score));
    for (const match of correlation.matches) {
      scores.set(match.itemId, Math.max(scores.get(match.itemId) ?? 0, match.score));
    }
  }
  return scores;
}

export function mergeTerminalTimeline(input: MergeTerminalTimelineInput): TerminalTimelineEntry[] {
  const scores = matchScores(input.correlations);
  const rows: TerminalTimelineEntry[] = [];

  for (const event of input.events ?? []) {
    rows.push({
      id: `event:${event.id}`,
      marketId: event.marketId,
      timestamp: event.timestamp,
      kind: event.kind,
      title: event.title,
      summary: event.summary,
      sourceLabel: event.source.label,
      impact: event.impact,
      importance: event.importance,
      correlationScore: scores.get(event.id) ?? null,
    });
  }

  for (const move of input.moves ?? []) {
    const delta = (move.probabilityAfter - move.probabilityBefore) * 100;
    rows.push({
      id: `move:${move.id}`,
      marketId: move.marketId,
      timestamp: move.timestamp,
      kind: "market_move",
      title: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}c probability move`,
      summary: `${cents(move.probabilityBefore)} to ${cents(move.probabilityAfter)} over ${move.windowMinutes}m on $${Math.round(move.volumeUsd).toLocaleString()} volume.`,
      sourceLabel: move.source,
      impact: moveImpact(move),
      importance: Math.min(100, Math.round(Math.abs(delta) * 8 + Math.log10(move.volumeUsd + 1) * 7)),
      correlationScore: scores.get(move.id) ?? null,
    });
  }

  for (const wallet of input.walletActivity ?? []) {
    rows.push({
      id: `wallet:${wallet.id}`,
      marketId: wallet.marketId,
      timestamp: wallet.timestamp,
      kind: "wallet",
      title: `${wallet.label ?? wallet.walletAddress.slice(0, 10)} ${wallet.side} ${wallet.outcome}`,
      summary: `$${Math.round(wallet.notionalUsd).toLocaleString()} notional at ${cents(wallet.price)}.`,
      sourceLabel: wallet.source,
      impact: walletImpact(wallet),
      importance: Math.min(100, Math.round(Math.log10(wallet.notionalUsd + 1) * 18)),
      correlationScore: scores.get(wallet.id) ?? null,
    });
  }

  return rows.sort((a, b) => {
    const timeDelta = Date.parse(b.timestamp) - Date.parse(a.timestamp);
    if (timeDelta !== 0) return timeDelta;
    return b.importance - a.importance;
  });
}
