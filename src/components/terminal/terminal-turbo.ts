import type { AlertRule } from "@/lib/terminal/types";

export type TurboMarketInput = {
  id: string;
  title: string;
  yes: number | null;
  no: number | null;
  movePct: number | null;
  spread: number | null;
  liquidity: number | null;
  volume24h: number | null;
  sourceCount: number;
  hasCatalyst: boolean;
  topCatalystTitle: string | null;
};

export type TurboSourceInput = {
  provider: string;
  title: string;
  category: string;
  reliability?: number | null;
  origin?: string | null;
  publishedAt?: string | null;
};

export type TurboTradeInput = {
  price?: number | null;
  size?: number | null;
  side?: string | null;
  timestamp?: string | number | null;
};

export type TurboDiscoveryRowInput = {
  id: string;
  question: string;
  terminalScore?: number | null;
  volume24hr?: number | null;
  liquidityNum?: number | null;
  shortMovePct?: number | null;
  yesPrice?: number | null;
  hoursToClose?: number | null;
  sourceDensity?: number | null;
};

export type TurboRelatedMarketInput = {
  marketId: string;
  title: string;
  movePercent?: number | null;
  directionAligned?: boolean | null;
  yesPrice?: number | null;
};

export type TurboAction = {
  id: "analyze" | "pin" | "evidence" | "replay" | "alert" | "compare";
  label: string;
  reason: string;
  priority: number;
};

export type WarRoomChecklistItem = {
  id: "price" | "book" | "tape" | "sources" | "decision";
  label: string;
  detail: string;
  ready: boolean;
};

export type ReplayFrame = {
  index: number;
  time: number;
  price: number;
  delta: number;
  events: string[];
};

export type SmartAlertDraft = {
  enabled: boolean;
  summary: string;
  rules: Array<{
    metric: "move" | "confidence" | "liquidity" | "spread";
    operator: ">=" | "<=";
    value: number;
    unit: "%" | "usd" | "c";
  }>;
};

export type EvidenceConfidenceItem = {
  title: string;
  provider: string;
  score: number;
  reasons: string[];
};

export type RelatedMarketGraph = {
  nodes: Array<{ id: string; label: string; tone: "focus" | "aligned" | "diverged" }>;
  links: Array<{ source: string; target: string; weight: number; tone: "aligned" | "diverged" }>;
};

export type TapeSignal = {
  id: "whale-print" | "buy-pressure" | "sell-pressure" | "thin-tape";
  label: string;
  detail: string;
  tone: "up" | "down" | "warn" | "neutral";
};

export type DecisionJournalDraft = {
  marketId: string;
  title: string;
  thesis: string;
  tags: string[];
  checklist: string[];
};

export type HeatmapCell = {
  id: "momentum" | "liquidity" | "deadline" | "sources" | "mispricing";
  label: string;
  intensity: number;
  detail: string;
};

export type CommandSuggestion = {
  command: string;
  label: string;
  description: string;
};

export type WhyMovedBadge = {
  label: "Move explained" | "Needs source" | "Low confidence" | "Official source";
  tone: "up" | "warn" | "neutral" | "blue";
  reason: string;
};

export type MarketTableSavedView = {
  id: "high-volume" | "closing-24h" | "crypto" | "watchlist-movers";
  label: string;
  description: string;
  shareParams: Record<string, string>;
};

export const MARKET_TABLE_SAVED_VIEWS: MarketTableSavedView[] = [
  {
    id: "high-volume",
    label: "High Volume",
    description: "Sort by volume with a 100k minimum.",
    shareParams: { view: "high-volume", min_volume: "100000", sort: "volume", dir: "desc" },
  },
  {
    id: "closing-24h",
    label: "Closing 24h",
    description: "Markets resolving inside the next day.",
    shareParams: { view: "closing-24h", status: "closing", sort: "close", dir: "asc" },
  },
  {
    id: "crypto",
    label: "Crypto",
    description: "Crypto category markets with public liquidity.",
    shareParams: { view: "crypto", category: "Crypto", q: "crypto", sort: "score", dir: "desc" },
  },
  {
    id: "watchlist-movers",
    label: "Watchlist + Movers",
    description: "Pinned markets ordered by absolute move.",
    shareParams: { view: "watchlist-movers", status: "pinned", sort: "move", dir: "desc" },
  },
];

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function ageHours(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

function pct(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildAutopilotActions(market: TurboMarketInput): TurboAction[] {
  const absMove = Math.abs(pct(market.movePct));
  const actions: TurboAction[] = [];
  if (!market.hasCatalyst && absMove >= 6) {
    actions.push({
      id: "analyze",
      label: "Analyze catalyst",
      reason: `${absMove.toFixed(1)}% move has no matched catalyst yet.`,
      priority: 100,
    });
  }
  if (market.sourceCount > 0) {
    actions.push({
      id: "evidence",
      label: "Open evidence",
      reason: `${market.sourceCount} sources are available for this market.`,
      priority: 82,
    });
  }
  if (market.spread != null && market.spread <= 0.03) {
    actions.push({
      id: "alert",
      label: "Arm smart alert",
      reason: "Tight spread makes movement alerts actionable.",
      priority: 76,
    });
  }
  actions.push({
    id: "pin",
    label: "Pin to watchlist",
    reason: "Keep this market visible while the desk refreshes.",
    priority: 58,
  });
  if (market.volume24h != null && market.volume24h > 250_000) {
    actions.push({
      id: "replay",
      label: "Replay move",
      reason: "Enough volume exists to inspect the path into the move.",
      priority: 70,
    });
  }
  actions.push({
    id: "compare",
    label: "Compare related",
    reason: "Check whether nearby markets agree or diverge.",
    priority: 52,
  });
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

export function buildWarRoomChecklist({
  market,
  sourceCount,
  tradeCount,
  hasBook,
}: {
  market: TurboMarketInput;
  sourceCount: number;
  tradeCount: number;
  hasBook: boolean;
}): WarRoomChecklistItem[] {
  return [
    {
      id: "price",
      label: "Price jump",
      detail: market.movePct == null ? "No isolated jump yet" : `${market.movePct.toFixed(1)}% session move`,
      ready: market.movePct != null,
    },
    {
      id: "book",
      label: "Order book",
      detail: hasBook ? "Bid/ask depth loaded" : "Depth is still missing",
      ready: hasBook,
    },
    {
      id: "tape",
      label: "Trade tape",
      detail: `${tradeCount} recent public prints`,
      ready: tradeCount > 0,
    },
    {
      id: "sources",
      label: "Evidence",
      detail: `${sourceCount} source documents`,
      ready: sourceCount > 0,
    },
    {
      id: "decision",
      label: "Decision",
      detail: market.hasCatalyst ? "Catalyst result ready" : "Needs catalyst analysis",
      ready: market.hasCatalyst,
    },
  ];
}

export function buildMarketReplayFrames(
  history: Array<{ t: number; p: number }> | undefined,
  sources: TurboSourceInput[],
): ReplayFrame[] {
  const points = (history ?? []).filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p));
  if (!points.length) return [];
  const stride = Math.max(1, Math.floor(points.length / 8));
  return points
    .filter((_, index) => index % stride === 0 || index === points.length - 1)
    .slice(-10)
    .map((point, index, sampled) => {
      const prev = sampled[index - 1]?.p ?? point.p;
      const nearby = sources
        .filter((source) => {
          const age = ageHours(source.publishedAt);
          return age == null || age <= 24;
        })
        .slice(0, index === sampled.length - 1 ? 3 : 1)
        .map((source) => source.title);
      return {
        index,
        time: point.t,
        price: point.p,
        delta: point.p - prev,
        events: nearby,
      };
    });
}

export function buildSmartAlertDraft(market: TurboMarketInput, confidenceScore: number): SmartAlertDraft {
  const absMove = Math.abs(pct(market.movePct));
  return {
    enabled: absMove >= 5 || confidenceScore >= 65,
    summary: `Alert when ${market.title} move holds near ${absMove.toFixed(1)}% with confidence ${confidenceScore.toFixed(0)}.`,
    rules: [
      { metric: "move", operator: ">=", value: Math.max(5, Math.round(absMove)), unit: "%" },
      { metric: "confidence", operator: ">=", value: Math.max(55, Math.round(confidenceScore)), unit: "%" },
      { metric: "liquidity", operator: ">=", value: Math.max(10_000, market.liquidity ?? 10_000), unit: "usd" },
      { metric: "spread", operator: "<=", value: Math.round((market.spread ?? 0.05) * 100), unit: "c" },
    ],
  };
}

export function buildEvidenceConfidence(sources: TurboSourceInput[]): EvidenceConfidenceItem[] {
  return sources
    .map((source) => {
      const reliability = clamp((source.reliability ?? 0.45) * 100);
      const freshness = ageHours(source.publishedAt);
      const freshnessScore = freshness == null ? 18 : clamp(36 - freshness * 2, 8, 36);
      const originBoost = source.origin === "fresh" ? 10 : 3;
      const categoryBoost = source.category === "event_graph" ? 14 : source.category === "price_feed" ? 10 : 6;
      const score = clamp(reliability * 0.48 + freshnessScore + originBoost + categoryBoost);
      const reasons = [
        `${Math.round(reliability)} reliability`,
        freshness == null ? "unknown age" : `${freshness.toFixed(1)}h old`,
        source.origin === "fresh" ? "fresh pull" : "stored context",
        source.category.replace(/_/g, " "),
      ];
      return { title: source.title, provider: source.provider, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildRelatedMarketGraph(
  focusedId: string,
  related: TurboRelatedMarketInput[],
): RelatedMarketGraph {
  return {
    nodes: [
      { id: focusedId, label: "Focused market", tone: "focus" },
      ...related.map((market) => ({
        id: market.marketId,
        label: market.title,
        tone: market.directionAligned ? "aligned" as const : "diverged" as const,
      })),
    ],
    links: related.map((market) => ({
      source: focusedId,
      target: market.marketId,
      weight: clamp(Math.abs(pct(market.movePercent)) * 8, 12, 100),
      tone: market.directionAligned ? "aligned" as const : "diverged" as const,
    })),
  };
}

export function buildTradeTapeSignals(trades: TurboTradeInput[]): TapeSignal[] {
  const valid = trades.filter((trade) => typeof trade.size === "number" && trade.size > 0);
  const total = valid.reduce((sum, trade) => sum + (trade.size ?? 0), 0);
  const buy = valid
    .filter((trade) => String(trade.side ?? "").toUpperCase().includes("BUY") || String(trade.side ?? "").toUpperCase() === "YES")
    .reduce((sum, trade) => sum + (trade.size ?? 0), 0);
  const sell = total - buy;
  const largest = valid.reduce((max, trade) => Math.max(max, trade.size ?? 0), 0);
  const signals: TapeSignal[] = [];
  if (largest >= Math.max(5_000, total * 0.28)) {
    signals.push({
      id: "whale-print",
      label: "Whale print",
      detail: `Largest print ${largest.toLocaleString()} shares.`,
      tone: "warn",
    });
  }
  if (total === 0 || valid.length < 3) {
    signals.push({
      id: "thin-tape",
      label: "Thin tape",
      detail: "Not enough recent public prints to trust flow.",
      tone: "neutral",
    });
  } else if (buy / total >= 0.62) {
    signals.push({
      id: "buy-pressure",
      label: "Buy pressure",
      detail: `${Math.round((buy / total) * 100)}% of recent size leans YES/buy.`,
      tone: "up",
    });
  } else if (sell / total >= 0.62) {
    signals.push({
      id: "sell-pressure",
      label: "Sell pressure",
      detail: `${Math.round((sell / total) * 100)}% of recent size leans NO/sell.`,
      tone: "down",
    });
  }
  return signals;
}

export function buildDecisionJournal(market: TurboMarketInput, statusLabel: string): DecisionJournalDraft {
  return {
    marketId: market.id,
    title: market.title,
    thesis: `${statusLabel}: ${market.topCatalystTitle ?? "watch price, sources, and tape before acting."}`,
    tags: ["turbo", market.hasCatalyst ? "catalyst-ready" : "needs-catalyst", market.sourceCount ? "source-backed" : "thin-evidence"],
    checklist: ["Snapshot saved", "Evidence reviewed", "Risk noted", "Next action chosen"],
  };
}

export function buildOpportunityHeatmap(rows: TurboDiscoveryRowInput[]): HeatmapCell[] {
  const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const momentum = avg(rows.map((row) => Math.abs(pct(row.shortMovePct))).filter(Boolean));
  const liquidity = avg(rows.map((row) => Math.log10(1 + pct(row.liquidityNum))).filter(Boolean)) * 13;
  const deadline = rows.filter((row) => row.hoursToClose != null && row.hoursToClose <= 24).length * 18;
  const sources = avg(rows.map((row) => pct(row.sourceDensity)).filter(Boolean)) * 18;
  const mispricing = avg(rows.map((row) => Math.abs(0.5 - pct(row.yesPrice, 0.5)) * 100));
  const cells: HeatmapCell[] = [
    { id: "momentum", label: "Momentum", intensity: clamp(momentum * 8), detail: `${momentum.toFixed(1)} avg move` },
    { id: "liquidity", label: "Liquidity", intensity: clamp(liquidity), detail: "depth and volume cluster" },
    { id: "deadline", label: "Deadline", intensity: clamp(deadline), detail: "markets closing soon" },
    { id: "sources", label: "Sources", intensity: clamp(sources), detail: "indexed evidence density" },
    { id: "mispricing", label: "Mispricing", intensity: clamp(mispricing * 1.6), detail: "distance from coin flip" },
  ];
  return cells.sort((a, b) => b.intensity - a.intensity);
}

export function buildCommandSuggestions(focusedId: string, query: string): CommandSuggestion[] {
  const clean = query.trim();
  const base = [
    { command: "go sources", label: "Go sources", description: "Open the evidence library for the focused market." },
    { command: "show movers", label: "Show movers", description: "Jump to movement, tape, wallets, and liquidity." },
    { command: "search crypto", label: "Search crypto", description: "Search All Markets for crypto markets." },
    { command: `open market ${focusedId}`, label: "Open market", description: "Open the focused market detail view." },
    { command: `analyze ${focusedId}`, label: "Analyze catalyst", description: "Run catalyst scoring for the focused market." },
    { command: `replay ${focusedId}`, label: "Replay market", description: "Inspect price path with source events." },
    { command: `alert ${focusedId}`, label: "Build alert", description: "Create a movement + evidence rule draft." },
    { command: `graph ${focusedId}`, label: "Related graph", description: "Map aligned and divergent nearby markets." },
    { command: `journal ${focusedId}`, label: "Open journal", description: "Save a structured decision note." },
  ];
  if (!clean) return base;
  const q = clean.toLowerCase();
  const filtered = base.filter((item) =>
    item.command.toLowerCase().includes(q) ||
    item.label.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q),
  );
  return filtered.length ? filtered : base;
}

export function buildWhyMovedBadge(
  row: TurboDiscoveryRowInput,
  opts: { hasOfficialSource?: boolean } = {},
): WhyMovedBadge {
  const sourceDensity = row.sourceDensity ?? 0;
  const score = row.terminalScore ?? 0;
  const absMove = Math.abs(row.shortMovePct ?? 0);

  if (opts.hasOfficialSource && sourceDensity > 0) {
    return {
      label: "Official source",
      tone: "blue",
      reason: `${sourceDensity} indexed source${sourceDensity === 1 ? "" : "s"} include primary-source evidence.`,
    };
  }

  if (sourceDensity <= 0) {
    return {
      label: "Needs source",
      tone: "warn",
      reason: "No indexed source documents are attached to this row yet.",
    };
  }

  if (score < 35 || absMove < 3) {
    return {
      label: "Low confidence",
      tone: "neutral",
      reason: "Move or score is too weak for a high-confidence explanation.",
    };
  }

  return {
    label: "Move explained",
    tone: "up",
    reason: `${sourceDensity} source${sourceDensity === 1 ? "" : "s"} support the market move context.`,
  };
}

export function buildLocalAlertRuleFromDraft({
  marketId,
  marketTitle,
  draft,
  now,
}: {
  marketId: string | null;
  marketTitle: string;
  draft: SmartAlertDraft;
  now?: string;
}): AlertRule {
  const moveRule = draft.rules.find((rule) => rule.metric === "move");
  const thresholdPercent = moveRule?.value ?? 5;
  return {
    id: `local-draft-${Date.parse(now ?? new Date().toISOString()).toString(36)}`,
    marketId,
    name: `Suggested alert from this market move: ${marketTitle}`,
    kind: "probability_jump",
    threshold: Math.max(0.01, thresholdPercent / 100),
    windowMinutes: 30,
    enabled: true,
    createdAt: now ?? new Date().toISOString(),
  };
}
