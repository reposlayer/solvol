"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertRuleForm } from "@/components/terminal/AlertRuleForm";
import {
  EDITORIAL_CATEGORIES,
  editorialCategoryForText,
  type EditorialCategory,
} from "@/components/terminal/editorial-design-system";
import { PriceChart, type ChartMarker } from "@/components/terminal/PriceChart";
import { StatusStrip } from "@/components/terminal/StatusStrip";
import { SystemStatusPanel } from "@/components/terminal/SystemStatusPanel";
import { TopCommandBar } from "@/components/terminal/TopCommandBar";
import { useTerminal } from "@/components/terminal/terminal-context";
import {
  MARKET_TABLE_SAVED_VIEWS,
  buildAutopilotActions,
  buildCommandSuggestions,
  buildDecisionJournal,
  buildEvidenceConfidence,
  buildLocalAlertRuleFromDraft,
  buildMarketReplayFrames,
  buildOpportunityHeatmap,
  buildRelatedMarketGraph,
  buildSmartAlertDraft,
  buildTradeTapeSignals,
  buildWarRoomChecklist,
  buildWhyMovedBadge,
  type CommandSuggestion,
  type DecisionJournalDraft,
  type EvidenceConfidenceItem,
  type HeatmapCell,
  type MarketTableSavedView,
  type RelatedMarketGraph,
  type ReplayFrame,
  type SmartAlertDraft,
  type TapeSignal,
  type TurboAction,
  type WarRoomChecklistItem,
} from "@/components/terminal/terminal-turbo";
import {
  DISCOVERY_DEFAULT_CLOSING_HOURS,
  DISCOVERY_DEFAULT_LIMIT,
  parseClosingHoursFromSearch,
  parseDiscoveryLimitFromSearch,
  parseDiscoveryOffsetFromSearch,
  parseTagIdFromSearch,
} from "@/hooks/discovery-url";
import { TERMINAL_REFRESH } from "@/hooks/terminal-refresh";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { useMarketSnapshot } from "@/hooks/useMarketSnapshot";
import {
  useResearchReports,
  useSaveWorkspacePatch,
  useSourceLedger,
} from "@/hooks/useResearchDesk";
import { useTerminalDiscovery, useTerminalDiscoveryPayload } from "@/hooks/useTerminalDiscovery";
import type {
  CatalystScoringBreakdown,
  MarketMoveExplanation,
  SourceDocument,
} from "@/lib/domain/types";
import type {
  AlertEvent,
  AlertRule,
  DataSourceStatus,
  MarketMove,
  MarketScores,
  MarketSourceStatus,
  NewsItem,
  WalletActivity,
  WhyMovedCandidate,
} from "@/lib/terminal/types";
import type { DiscoveryLane, DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { buildPolymarketMarketUrl } from "@/lib/polymarket/links";
import {
  TERMINAL_ROUTES,
  terminalRouteById,
  terminalRouteHref,
  terminalSectionFromPath,
  type TerminalRoute,
} from "@/lib/terminal/routes";
import {
  fmtCents,
  fmtDateTime,
  fmtHours,
  fmtPct,
  fmtTime,
  fmtUsd,
  moveToneClass,
  shorten,
} from "@/lib/format";

const LANE_LABEL: Record<DiscoveryLane, string> = {
  all_markets: "Browse",
  hot: "Hot",
  high_volume: "Volume",
  closing_soon: "Closing",
  new: "New",
  research_worthy: "Research",
  deadline_risk: "Deadline",
  anomaly: "Anomaly",
  catalyst_rich: "Catalyst",
};

const LANE_INTENT: Record<DiscoveryLane, string> = {
  all_markets: "All public events",
  hot: "Fastest pressure",
  high_volume: "Most active money",
  closing_soon: "Deadlines in view",
  new: "Fresh markets",
  research_worthy: "Needs evidence",
  deadline_risk: "Close to resolution",
  anomaly: "Unusual flow",
  catalyst_rich: "Source dense",
};

const LANES: DiscoveryLane[] = [
  "all_markets",
  "hot",
  "catalyst_rich",
  "anomaly",
  "high_volume",
  "deadline_risk",
  "research_worthy",
  "closing_soon",
  "new",
];

type ProductWorkspaceId =
  | "markets"
  | "market"
  | "flow"
  | "sources"
  | "alerts"
  | "watchlist"
  | "status";

const PROVIDER_LABEL: Record<SourceDocument["provider"], string> = {
  rss: "RSS",
  gdelt: "GDELT",
  coingecko: "CoinGecko",
  wikidata: "Wikidata",
  fred: "FRED",
  alpha_vantage: "Alpha Vantage",
};

// Static surface manifest for tests and code search; some labels/classes render through extracted components.
// Editorial masthead, category nav, front page, market detail, movement scanner, whale tracker, event timeline,
// sources, alerts, watchlist, data sources, live-desk-ribbon, terminal-system-panel.
// terminal-why-badge, Move explained, Needs source, Low confidence, Official source, terminal-source-count-button,
// terminal-saved-view-bar, High Volume, Closing 24h, Crypto, Watchlist + Movers, Share view,
// terminal-market-compare-drawer, Compare 2-4 markets, Source density, terminal-provenance-drawer, Raw links,
// checksum, adapter, score breakdown, ArrowDown, ArrowUp, event.key === "/", event.key.toLowerCase() === "w".
// terminal-operator-mini-bar, Sources degraded, Last refresh, markets loaded,
// Saved locally / synced when logged in, Pinned-only view, Live unavailable, demo data shown,
// terminal-command-palette, go sources, show movers, search crypto, open market,
// Suggested alert from this market move, Create local draft, read-only rule.

type TimelineItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  timeLabel: string;
  sortTime: number;
  impact: string;
  confidence: string;
  tone: "up" | "down" | "neutral" | "warn";
  provider?: string;
  category?: string;
  origin?: string;
  url?: string | null;
};

type CatalystStatus = {
  label: string;
  detail: string;
  tone: "up" | "down" | "neutral" | "warn" | "blue";
};

type MarketIntelData = NonNullable<ReturnType<typeof useMarketIntel>["data"]>;

type ProvenanceDrawerRequest = {
  title: string;
  kind: "all-sources" | "market-row" | "source" | "candidate" | "source-health";
  row?: DiscoveryMarketRow;
  source?: SourceDocument;
  candidate?: WhyMovedCandidate;
  sourceHealth?: DataSourceStatus;
};

function isDiscoveryLane(raw: string | null): raw is DiscoveryLane {
  return (
    raw === "all_markets" ||
    raw === "hot" ||
    raw === "high_volume" ||
    raw === "closing_soon" ||
    raw === "new" ||
    raw === "research_worthy" ||
    raw === "deadline_risk" ||
    raw === "anomaly" ||
    raw === "catalyst_rich"
  );
}

function laneHref(lane: DiscoveryLane, searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set("lane", lane);
  next.set("limit", "80");
  next.delete("offset");
  return `/terminal/markets?${next.toString()}`;
}

function marketPolymarketHref({
  polymarketUrl,
  eventSlug,
  slug,
  question,
  id,
}: {
  polymarketUrl?: string | null;
  eventSlug?: string | null;
  slug?: string | null;
  question?: string | null;
  id?: string | null;
}): string {
  return (
    polymarketUrl ??
    buildPolymarketMarketUrl({
      eventSlug,
      question,
      marketSlug: slug,
      id,
    })
  );
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / (1000 * 60 * 60);
}

function sessionMove(history: { p: number }[] | undefined, fallback: number | null | undefined) {
  const first = history?.[0]?.p ?? null;
  const last = history?.[history.length - 1]?.p ?? fallback ?? null;
  return first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
}

function sourceCategoryLabel(category: SourceDocument["category"] | string): string {
  if (category === "event_graph") return "Event graph";
  if (category === "price_feed") return "Price feed";
  if (category === "entity_context") return "Entity context";
  return category.replace(/_/g, " ");
}

function sourceReliabilityLabel(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "Unrated";
  return fmtPct(score * 100, { digits: 0 });
}

function sourceOriginLabel(origin: SourceDocument["origin"] | undefined): string {
  return origin === "stored" ? "Stored" : "Fresh";
}

function timestampMs(raw: number | string | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw * (raw < 1e12 ? 1000 : 1);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activate(event: KeyboardEvent<HTMLElement>, fn: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  fn();
}

function productWorkspaceFromRoute(route: TerminalRoute | null): ProductWorkspaceId {
  if (!route) return "markets";
  if (route.id === "markets" || route.id === "trending" || route.id === "deadlines") return "markets";
  if (route.id === "movers") return "flow";
  if (route.id === "sources") return "sources";
  if (route.id === "alerts") return "alerts";
  if (route.id === "watchlist") return "watchlist";
  if (route.id === "status") return "status";
  return "market";
}

function categoryHref(category: EditorialCategory, searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set("q", category.toLowerCase());
  next.set("lane", "all_markets");
  next.delete("offset");
  return `/terminal/markets?${next.toString()}`;
}

function sortedByVolume(rows: DiscoveryMarketRow[]) {
  return [...rows].sort((a, b) => b.volume24hr - a.volume24hr);
}

function sortedByMove(rows: DiscoveryMarketRow[]) {
  return [...rows].sort((a, b) => Math.abs(b.shortMovePct ?? 0) - Math.abs(a.shortMovePct ?? 0));
}

function sortedByDeadline(rows: DiscoveryMarketRow[]) {
  return [...rows].sort((a, b) => (a.hoursToClose ?? Infinity) - (b.hoursToClose ?? Infinity));
}

function metricToneClass(value: number | null | undefined) {
  const tone = moveToneClass(value);
  if (tone.includes("--terminal-up")) return "is-up";
  if (tone.includes("--terminal-down")) return "is-down";
  return "";
}

function dataModeLabel(
  dataMode: string | undefined,
  labels: { real?: string; mock?: string; pending?: string } = {},
) {
  if (dataMode === "mock") return labels.mock ?? "demo fallback";
  if (dataMode === "real") return labels.real ?? "live";
  return labels.pending ?? "checking";
}

function dataModeStatusCopy(dataMode: string | undefined) {
  if (dataMode === "mock") return "Live unavailable, demo data shown";
  if (dataMode === "real") return "Live public data shown";
  return "Checking public data mode";
}

function sourceLooksOfficial(source: SourceDocument): boolean {
  const text = `${source.provider} ${source.category} ${source.title} ${source.url ?? ""}`.toLowerCase();
  return (
    source.category === "macro" ||
    text.includes("official") ||
    text.includes("federal") ||
    text.includes("sec") ||
    text.includes("filing") ||
    text.includes(".gov")
  );
}

function screenerSortFromParam(raw: string | null): ScreenerSortKey {
  if (raw === "probability" || raw === "move" || raw === "volume" || raw === "liquidity" || raw === "close" || raw === "score") {
    return raw;
  }
  return "score";
}

function screenerStatusFromParam(raw: string | null): ScreenerStatusFilter {
  if (raw === "closing" || raw === "pinned") return raw;
  return "all";
}

function screenerCategoryFromParam(raw: string | null): EditorialCategory | "all" {
  return EDITORIAL_CATEGORIES.includes(raw as EditorialCategory) ? raw as EditorialCategory : "all";
}

function numberFromParam(raw: string | null): number {
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function signalReason(row: DiscoveryMarketRow, lane: DiscoveryLane): string {
  if (lane === "deadline_risk" || row.hoursToClose != null) {
    return `${fmtHours(row.hoursToClose ?? null)} to close`;
  }
  if (lane === "anomaly") {
    return row.volumeSpikeRatio ? `${row.volumeSpikeRatio.toFixed(1)}x volume pace` : "abnormal volume";
  }
  if (lane === "research_worthy" || lane === "catalyst_rich") {
    return `${fmtUsd(row.liquidityNum)} liquidity`;
  }
  if (lane === "new") return "new listing";
  if (lane === "high_volume") return `${fmtUsd(row.volume24hr)} 24h`;
  return "ranked live";
}

function catalystStatus(
  result: MarketMoveExplanation | null,
  focusedId: string,
): CatalystStatus {
  if (!result || result.marketId !== focusedId) {
    return {
      label: "No clear catalyst",
      detail: "Move has not been matched against fresh evidence yet.",
      tone: "neutral",
    };
  }
  if (result.likelyCatalysts.length === 0 || result.confidence < 30) {
    return {
      label: "No clear catalyst",
      detail: "Evidence is not strong enough to rank a public catalyst.",
      tone: "neutral",
    };
  }
  if (result.confidence >= 70) {
    return {
      label: "Strong correlation",
      detail: "Top signal aligns closely with timing, entities, and market direction.",
      tone: "up",
    };
  }
  if (result.confidence >= 45) {
    return {
      label: "Likely catalyst candidate",
      detail: "Evidence is plausible, but should still be verified against sources.",
      tone: "blue",
    };
  }
  return {
    label: "Weak signal",
    detail: "There is partial evidence, but liquidity or timing could explain the move.",
    tone: "warn",
  };
}

function breakdownRows(breakdown: CatalystScoringBreakdown | undefined) {
  if (!breakdown) return [];
  return [
    {
      label: "Time score",
      value: breakdown.temporalProximity,
      note: "Signal proximity to the detected move window",
    },
    {
      label: "Source score",
      value: breakdown.sourceReliability,
      note: "Provider reliability and official-source weight",
    },
    {
      label: "Volume support",
      value: breakdown.volumeSupport,
      note: "Whether traded volume supports a real repricing",
    },
    {
      label: "Related market",
      value: breakdown.crossMarketSupport,
      note: "Alignment with nearby markets",
    },
    {
      label: "Liquidity friction",
      value: breakdown.liquidityPenalty,
      note: "Penalty risk from thin books or noisy spreads",
    },
  ].filter((row): row is { label: string; value: number; note: string } => row.value != null);
}

function buildTimelineItems({
  focusedId,
  snapshot,
  intel,
  result,
}: {
  focusedId: string;
  snapshot: ReturnType<typeof useMarketSnapshot>["data"];
  intel: ReturnType<typeof useMarketIntel>["data"];
  result: ReturnType<typeof useTerminal>["result"];
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (snapshot?.jump) {
    items.push({
      id: `jump-${snapshot.jump.t}`,
      kind: "Price move",
      title: `${snapshot.jump.direction} probability jump`,
      detail: `${fmtCents(snapshot.jump.priceBefore, 1)} to ${fmtCents(snapshot.jump.priceAfter, 1)} in the detected move window.`,
      timeLabel: fmtTime(snapshot.jump.t),
      sortTime: timestampMs(snapshot.jump.t),
      impact: `${snapshot.jump.moveCents >= 0 ? "+" : ""}${snapshot.jump.moveCents.toFixed(1)}c`,
      confidence: "Observed",
      tone: snapshot.jump.direction === "YES" ? "up" : "down",
      provider: "Polymarket",
      category: "Price path",
      origin: "Fresh",
    });
  }

  if (result?.marketId === focusedId) {
    for (const catalyst of result.likelyCatalysts.slice(0, 6)) {
      items.push({
        id: `catalyst-${catalyst.timestamp}-${catalyst.title}`,
        kind: "Catalyst",
        title: catalyst.title,
        detail: catalyst.summary || catalyst.evidence[0] || "Catalyst scored against the move window.",
        timeLabel: fmtDateTime(catalyst.timestamp),
        sortTime: timestampMs(catalyst.timestamp),
        impact: catalyst.direction,
        confidence: fmtPct(catalyst.confidence, { digits: 0 }),
        tone:
          catalyst.direction === "YES"
            ? "up"
            : catalyst.direction === "NO"
              ? "down"
              : "warn",
        provider: catalyst.source.replace(/_/g, " "),
        category: sourceCategoryLabel(catalyst.source),
        origin: "Fresh",
        url: catalyst.sourceUrl,
      });
    }
  }

  for (const source of intel?.sources.slice(0, 8) ?? []) {
    const time = source.publishedAt ?? source.retrievedAt;
    items.push({
      id: `source-${source.provider}-${source.externalId}`,
      kind: sourceCategoryLabel(source.category),
      title: source.title,
      detail:
        source.summary ??
        (source.matchedTerms.length ? `Matched ${source.matchedTerms.slice(0, 4).join(", ")}.` : "Indexed source document."),
      timeLabel: source.publishedAt ? fmtDateTime(source.publishedAt) : "Indexed",
      sortTime: timestampMs(time),
      impact: sourceCategoryLabel(source.category),
      confidence: sourceReliabilityLabel(source.reliability),
      tone: source.category === "price_feed" ? "up" : source.category === "macro" ? "warn" : "neutral",
      provider: PROVIDER_LABEL[source.provider],
      category: sourceCategoryLabel(source.category),
      origin: sourceOriginLabel(source.origin),
      url: source.url,
    });
  }

  for (const trade of intel?.trades.slice(0, 3) ?? []) {
    items.push({
      id: `trade-${trade.transactionHash ?? trade.timestamp}-${trade.price}-${trade.size}`,
      kind: "Print",
      title: `${trade.side} print at ${fmtCents(trade.price, 1)}`,
      detail: `${fmtUsd(trade.notional)} notional at ${fmtTime(trade.timestamp)}.`,
      timeLabel: fmtTime(trade.timestamp),
      sortTime: timestampMs(trade.timestamp),
      impact: trade.side,
      confidence: "Tape",
      tone: trade.side === "BUY" ? "up" : "down",
      provider: "CLOB",
      category: "Trade tape",
      origin: "Fresh",
    });
  }

  for (const item of intel?.news.slice(0, 4) ?? []) {
    items.push({
      id: `news-${item.id}`,
      kind: "Headline",
      title: item.title,
      detail: item.summary ?? item.feedLabel,
      timeLabel: fmtDateTime(item.publishedAt),
      sortTime: timestampMs(item.publishedAt),
      impact: item.feedLabel,
      confidence: item.relevanceScore != null ? `${item.relevanceScore.toFixed(1)} score` : "RSS",
      tone: "neutral",
      provider: item.feedLabel,
      category: item.category ?? "news",
      origin: "Fresh",
      url: item.link,
    });
  }

  return items
    .sort((a, b) => b.sortTime - a.sortTime)
    .slice(0, 14);
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "up" | "down" | "warn" | "neutral";
}) {
  return (
    <div className={`redesign-metric ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "up" | "down" | "warn" | "neutral" | "blue";
}) {
  return <span className={`redesign-badge is-${tone}`}>{children}</span>;
}

function phraseToken(value: string): string {
  return value.replace(/_/g, " ");
}

function candidateEvidenceTone(candidate: WhyMovedCandidate): "up" | "down" | "warn" | "neutral" {
  if (candidate.evidenceStatus === "supported") return "up";
  if (candidate.evidenceStatus === "insufficient_evidence") return "warn";
  if (candidate.evidenceStatus === "contradicted" || candidate.evidenceStatus === "divergent_market") return "down";
  return "neutral";
}

function candidateDivergenceLabel(candidate: WhyMovedCandidate): string {
  if (!candidate.marketDivergence.detected) return "aligned";
  return `${candidate.marketDivergence.expectedDirection} expected / ${candidate.marketDivergence.observedDirection} observed`;
}

function candidateConflictLabel(candidate: WhyMovedCandidate): string {
  const count = candidate.conflictingNewsItemIds?.length ?? 0;
  return count ? `${count} conflicting source${count === 1 ? "" : "s"}` : "none";
}

function LiveDeskTopbar({
  focusedId,
  status,
  searchParams,
  suggestions,
  onCommand,
}: {
  focusedId: string;
  status: CatalystStatus;
  searchParams: URLSearchParams;
  suggestions: CommandSuggestion[];
  onCommand: (command: string) => void;
}) {
  const { themeMode, toggleThemeMode } = useTerminal();
  const [editionTime, setEditionTime] = useState({ date: "Loading edition", time: "--:--" });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setEditionTime({
        date: now.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        time: now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="editorial-masthead live-desk-topbar">
      <div className="live-desk-brand">
        <strong>SOLVOL</strong>
        <span>Polymarket Intelligence Terminal</span>
      </div>
      <TopCommandBar onCommand={onCommand} suggestions={suggestions} />
      <div className="live-desk-top-actions">
        <span>Public reads live</span>
        <span>{status.tone === "up" ? "Catalyst confirmed" : status.tone === "warn" ? "Catalyst watch" : "Catalyst pending"}</span>
        <button type="button" onClick={toggleThemeMode} aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}>
          {themeMode === "dark" ? "Light" : "Dark"}
        </button>
      </div>
      <div className="live-desk-user">
        <span>Edition time</span>
        <strong>{editionTime.time}</strong>
      </div>
      <p>
        <span className="editorial-edition-line">{editionTime.date}</span>
        Market intelligence workspace / Lead #{focusedId}
      </p>
      <nav className="editorial-category-nav" aria-label="Editorial categories">
        {EDITORIAL_CATEGORIES.map((category) => (
          <Link key={category} href={categoryHref(category, searchParams)}>
            {category}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function LiveDeskRibbon({
  movePct,
  sourceCount,
  marketCount,
  dataMode,
  onOpenProvenance,
}: {
  movePct: number | null;
  sourceCount: number;
  marketCount: number;
  dataMode: string | undefined;
  onOpenProvenance: () => void;
}) {
  return (
    <>
      <StatusStrip>
        <span className="is-live">LIVE</span>
        <span>Public market reads</span>
        <span>{marketCount} markets</span>
        <button type="button" className="terminal-ribbon-source-button" onClick={onOpenProvenance}>
          {sourceCount} sources
        </button>
        <span>Move {fmtPct(movePct, { sign: true })}</span>
        <span>CLOB {TERMINAL_REFRESH.intel.orderBookRevalidateSeconds}s</span>
        <span>Discovery {TERMINAL_REFRESH.discovery.refetchIntervalMs / 1000}s</span>
        <span>News {TERMINAL_REFRESH.feed.refetchIntervalMs / 1000}s</span>
      </StatusStrip>
      <div className="terminal-operator-mini-bar">
        <span>{sourceCount > 0 ? "Sources healthy" : "Sources degraded"}</span>
        <span>Last refresh {Math.round(TERMINAL_REFRESH.discovery.refetchIntervalMs / 1000)}s</span>
        <span>{marketCount} markets loaded</span>
        <span>Saved locally / synced when logged in</span>
        <span>Pinned-only view</span>
        <span>{dataModeStatusCopy(dataMode)}</span>
      </div>
    </>
  );
}

function MarketRadarRow({
  row,
  selected,
  lane,
  watched,
  onSelect,
}: {
  row: DiscoveryMarketRow;
  selected: boolean;
  lane: DiscoveryLane;
  watched: boolean;
  onSelect: () => void;
}) {
  const moveClass = metricToneClass(row.shortMovePct);
  const category = editorialCategoryForText(row.question);
  const yes = row.yesPrice;
  const no = yes == null ? null : 1 - yes;
  return (
    <article
      role="button"
      tabIndex={0}
      className={`redesign-market-row editorial-market-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => activate(event, onSelect)}
    >
      <div className="redesign-market-row-top">
        <Badge>{category}</Badge>
        <Badge tone={row.hoursToClose != null && row.hoursToClose < 24 ? "warn" : "blue"}>
          {signalReason(row, lane)}
        </Badge>
        {watched ? <Badge tone="warn">Pinned</Badge> : null}
      </div>
      <div className="editorial-card-body">
        <h3>{shorten(row.question, 104)}</h3>
        <div className="editorial-card-probability">
          <strong>{fmtCents(yes, 0)}</strong>
          <span>YES</span>
        </div>
      </div>
      <div className="editorial-sparkline" aria-hidden="true">
        {[0.32, 0.52, 0.44, 0.68, 0.58, 0.78, 0.64].map((height, index) => (
          <i
            key={`${row.id}-spark-${index}`}
            style={{ height: `${Math.round(height * 100)}%` }}
            className={row.shortMovePct != null && row.shortMovePct < 0 ? "is-down" : "is-up"}
          />
        ))}
      </div>
      <div className="redesign-row-stats editorial-market-meta">
        <span>YES {fmtCents(yes, 0)} / NO {fmtCents(no, 0)}</span>
        <span className={moveClass}>Chg {fmtPct(row.shortMovePct, { sign: true, digits: 1 })}</span>
        <span>Vol {fmtUsd(row.volume24hr)}</span>
        <span>Liq {fmtUsd(row.liquidityNum)}</span>
        <span>Ends {fmtDateTime(row.endDate)}</span>
      </div>
    </article>
  );
}

type ScreenerSortKey = "probability" | "move" | "volume" | "liquidity" | "close" | "score";
type ScreenerStatusFilter = "all" | "closing" | "pinned";

const MARKET_TABLE_SHARE_KEYS = [
  "view",
  "sort",
  "dir",
  "status",
  "category",
  "min_volume",
  "min_liquidity",
  "table_q",
  "q",
];

function TerminalScreenerTable({
  rows,
  focusedId,
  sourceDocuments = [],
  onOpenProvenance,
  onSelectMarket,
}: {
  rows: DiscoveryMarketRow[];
  focusedId: string;
  sourceDocuments?: SourceDocument[];
  onOpenProvenance: (request: ProvenanceDrawerRequest) => void;
  onSelectMarket: (id: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isWatched, toggleWatchlist } = useTerminal();
  const [sortKey, setSortKey] = useState<ScreenerSortKey>(() => screenerSortFromParam(searchParams.get("sort")));
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => searchParams.get("dir") === "asc" ? "asc" : "desc");
  const [textFilter, setTextFilter] = useState(() => searchParams.get("table_q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState<EditorialCategory | "all">(() => screenerCategoryFromParam(searchParams.get("category")));
  const [statusFilter, setStatusFilter] = useState<ScreenerStatusFilter>(() => screenerStatusFromParam(searchParams.get("status")));
  const [minVolume, setMinVolume] = useState(() => numberFromParam(searchParams.get("min_volume")));
  const [minLiquidity, setMinLiquidity] = useState(() => numberFromParam(searchParams.get("min_liquidity")));
  const [activeSavedView, setActiveSavedView] = useState<string | null>(() => searchParams.get("view"));
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const focusedHasOfficialSource = sourceDocuments.some(sourceLooksOfficial);

  useEffect(() => {
    function onShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || target?.isContentEditable) return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  function value(row: DiscoveryMarketRow, key: ScreenerSortKey): number {
    if (key === "probability") return row.yesPrice ?? -Infinity;
    if (key === "move") return row.shortMovePct ?? -Infinity;
    if (key === "volume") return row.volume24hr;
    if (key === "liquidity") return row.liquidityNum;
    if (key === "close") return row.hoursToClose ?? Infinity;
    return row.terminalScore ?? -Infinity;
  }

  function toggleSort(key: ScreenerSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "close" ? "asc" : "desc");
    }
  }

  function sortLabel(key: ScreenerSortKey, label: string): string {
    if (sortKey !== key) return `Sort by ${label}`;
    return `Sort by ${label}, currently ${sortDir === "asc" ? "ascending" : "descending"}`;
  }

  function updateShareParams(params: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("lane", "all_markets");
    next.delete("offset");
    for (const key of MARKET_TABLE_SHARE_KEYS) {
      next.delete(key);
    }
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/terminal/markets?${next.toString()}`, { scroll: false });
  }

  function applySavedView(view: MarketTableSavedView) {
    setActiveSavedView(view.id);
    if (view.id === "high-volume") {
      setStatusFilter("all");
      setTextFilter("");
      setCategoryFilter("all");
      setMinVolume(100_000);
      setMinLiquidity(0);
      setSortKey("volume");
      setSortDir("desc");
    } else if (view.id === "closing-24h") {
      setStatusFilter("closing");
      setTextFilter("");
      setCategoryFilter("all");
      setMinVolume(0);
      setMinLiquidity(0);
      setSortKey("close");
      setSortDir("asc");
    } else if (view.id === "crypto") {
      setStatusFilter("all");
      setTextFilter("crypto");
      setCategoryFilter("Crypto");
      setMinVolume(0);
      setMinLiquidity(0);
      setSortKey("score");
      setSortDir("desc");
    } else {
      setStatusFilter("pinned");
      setTextFilter("");
      setCategoryFilter("all");
      setMinVolume(0);
      setMinLiquidity(0);
      setSortKey("move");
      setSortDir("desc");
    }
    updateShareParams(view.shareParams);
  }

  async function shareCurrentView() {
    const next = new URLSearchParams(searchParams.toString());
    next.set("lane", "all_markets");
    next.set("sort", sortKey);
    next.set("dir", sortDir);
    next.set("status", statusFilter);
    next.set("category", categoryFilter);
    next.set("min_volume", String(minVolume));
    next.set("min_liquidity", String(minLiquidity));
    if (textFilter.trim()) next.set("table_q", textFilter.trim());
    else next.delete("table_q");
    next.delete("offset");
    const href = `${window.location.origin}/terminal/markets?${next.toString()}`;
    await navigator.clipboard?.writeText(href);
    setShareState("copied");
    window.setTimeout(() => setShareState("idle"), 1400);
  }

  function toggleCompare(id: string) {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return current.length >= 4 ? [...current.slice(1), id] : [...current, id];
    });
  }

  function openRowProvenance(row: DiscoveryMarketRow) {
    onOpenProvenance({
      kind: "market-row",
      title: row.question,
      row,
    });
  }

  const filtered = useMemo(() => {
    const text = textFilter.trim().toLowerCase();
    return rows.filter((row) => {
      const category = editorialCategoryForText(row.question);
      const textMatches = !text || `${row.question} ${row.eventTitle ?? ""}`.toLowerCase().includes(text);
      const categoryMatches = categoryFilter === "all" || category === categoryFilter;
      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "closing" && row.hoursToClose != null && row.hoursToClose <= 24) ||
        (statusFilter === "pinned" && isWatched(row.id));
      return textMatches && categoryMatches && statusMatches && row.volume24hr >= minVolume && row.liquidityNum >= minLiquidity;
    });
  }, [categoryFilter, isWatched, minLiquidity, minVolume, rows, statusFilter, textFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = value(a, sortKey);
      const bv = value(b, sortKey);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [filtered, sortDir, sortKey]);
  const compareRows = compareIds
    .map((id) => rows.find((row) => row.id === id) ?? null)
    .filter((row): row is DiscoveryMarketRow => row !== null);

  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, row: DiscoveryMarketRow, index: number) {
    if (event.currentTarget !== event.target) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = sorted[index + 1] ? index + 1 : 0;
      setKeyboardIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = sorted[index - 1] ? index - 1 : Math.max(0, sorted.length - 1);
      setKeyboardIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      searchInputRef.current?.focus();
      return;
    }
    if (event.key.toLowerCase() === "w") {
      event.preventDefault();
      toggleWatchlist(row.id);
      return;
    }
    activate(event, () => onSelectMarket(row.id));
  }

  return (
    <section className="terminal-screener editorial-market-table" aria-label="Market screener">
      <div className="terminal-screener-head">
        <strong>All Markets</strong>
        <span>
          {sorted.length} of {rows.length} markets / sorted by {sortKey} {sortDir}
        </span>
      </div>
      <div className="terminal-market-filterbar" aria-label="Market filters">
        <label>
          <span>Search</span>
          <input
            ref={searchInputRef}
            value={textFilter}
            onChange={(event) => setTextFilter(event.target.value)}
            placeholder="Market question or event"
            data-terminal-market-search
          />
        </label>
        <label>
          <span>Category</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as EditorialCategory | "all")}>
            <option value="all">All categories</option>
            {EDITORIAL_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ScreenerStatusFilter)}>
            <option value="all">All open</option>
            <option value="closing">Closing 24h</option>
            <option value="pinned">Watchlist</option>
          </select>
        </label>
        <label>
          <span>Volume</span>
          <select value={minVolume} onChange={(event) => setMinVolume(Number(event.target.value))}>
            <option value={0}>Any volume</option>
            <option value={10000}>$10k+</option>
            <option value={100000}>$100k+</option>
            <option value={1000000}>$1m+</option>
          </select>
        </label>
        <label>
          <span>Liquidity</span>
          <select value={minLiquidity} onChange={(event) => setMinLiquidity(Number(event.target.value))}>
            <option value={0}>Any liquidity</option>
            <option value={10000}>$10k+</option>
            <option value={100000}>$100k+</option>
            <option value={1000000}>$1m+</option>
          </select>
        </label>
      </div>
      <div className="terminal-saved-view-bar" aria-label="Saved market table views">
        {MARKET_TABLE_SAVED_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={activeSavedView === view.id ? "is-active" : ""}
            onClick={() => applySavedView(view)}
            title={view.description}
          >
            {view.label}
          </button>
        ))}
        <button type="button" onClick={() => void shareCurrentView()}>
          {shareState === "copied" ? "View copied" : "Share view"}
        </button>
      </div>
      <div className="terminal-screener-table">
        <div className="terminal-screener-row is-head">
          <span>Cmp</span>
          <span>Pin</span>
          <span>Market</span>
          <span>Why</span>
          <span>Sources</span>
          <button type="button" onClick={() => toggleSort("probability")} aria-label={sortLabel("probability", "YES probability")}>YES</button>
          <button type="button" onClick={() => toggleSort("move")} aria-label={sortLabel("move", "move")}>Move</button>
          <button type="button" onClick={() => toggleSort("volume")} aria-label={sortLabel("volume", "volume")}>Vol</button>
          <button type="button" onClick={() => toggleSort("liquidity")} aria-label={sortLabel("liquidity", "liquidity")}>Liq</button>
          <button type="button" onClick={() => toggleSort("close")} aria-label={sortLabel("close", "close")}>Close</button>
        </div>
        {sorted.map((row, index) => {
          const watched = isWatched(row.id);
          const whyBadge = buildWhyMovedBadge(row, { hasOfficialSource: row.id === focusedId && focusedHasOfficialSource });
          const sourceDensity = row.sourceDensity ?? 0;
          return (
            <div
              key={row.id}
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              role="button"
              tabIndex={index === keyboardIndex ? 0 : -1}
              className={`terminal-screener-row ${row.id === focusedId ? "is-selected" : ""} ${index === keyboardIndex ? "is-keyboard-focus" : ""}`}
              onClick={() => onSelectMarket(row.id)}
              onFocus={() => setKeyboardIndex(index)}
              onKeyDown={(event) => handleRowKeyDown(event, row, index)}
            >
              <label className="terminal-compare-check" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={compareIds.includes(row.id)}
                  onChange={() => toggleCompare(row.id)}
                  aria-label={`Compare ${row.question}`}
                />
              </label>
              <button
                type="button"
                className={`terminal-pin-button ${watched ? "is-active" : ""}`}
                aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleWatchlist(row.id);
                }}
              >
                {watched ? "*" : "+"}
              </button>
              <strong title={row.question}>{shorten(row.question, 46)}</strong>
              <button
                type="button"
                className={`terminal-why-badge is-${whyBadge.tone}`}
                title={whyBadge.reason}
                onClick={(event) => {
                  event.stopPropagation();
                  openRowProvenance(row);
                }}
              >
                {whyBadge.label}
              </button>
              <button
                type="button"
                className="terminal-source-count-button"
                onClick={(event) => {
                  event.stopPropagation();
                  openRowProvenance(row);
                }}
              >
                {sourceDensity} sources
              </button>
              <span className="tnum">{fmtCents(row.yesPrice, 0)}</span>
              <span className={`tnum ${metricToneClass(row.shortMovePct)}`}>
                {fmtPct(row.shortMovePct, { sign: true, digits: 1 })}
              </span>
              <span className="tnum">{fmtUsd(row.volume24hr)}</span>
              <span className="tnum">{fmtUsd(row.liquidityNum)}</span>
              <span className="tnum">{fmtHours(row.hoursToClose ?? null)}</span>
            </div>
          );
        })}
      </div>
      {compareIds.length ? (
        <aside className="terminal-market-compare-drawer" aria-label="Compare 2-4 markets">
          <div>
            <strong>Compare 2-4 markets</strong>
            <button type="button" onClick={() => setCompareIds([])}>Clear</button>
          </div>
          {compareRows.length < 2 ? <p>Select one more market to compare.</p> : null}
          <div className="terminal-compare-grid">
            <span>Market</span>
            <span>YES</span>
            <span>Move</span>
            <span>Volume</span>
            <span>Liquidity</span>
            <span>Deadline</span>
            <span>Source density</span>
            {compareRows.slice(0, 4).map((row) => (
              <div key={`compare-${row.id}`}>
                <strong>{shorten(row.question, 38)}</strong>
                <span>{fmtCents(row.yesPrice, 0)}</span>
                <span className={metricToneClass(row.shortMovePct)}>{fmtPct(row.shortMovePct, { sign: true, digits: 1 })}</span>
                <span>{fmtUsd(row.volume24hr)}</span>
                <span>{fmtUsd(row.liquidityNum)}</span>
                <span>{fmtHours(row.hoursToClose ?? null)}</span>
                <span>{row.sourceDensity ?? 0}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  );
}

function EditorialDigestPanel({
  title,
  deck,
  rows,
  focusedId,
  lane,
  onSelectMarket,
}: {
  title: string;
  deck: string;
  rows: DiscoveryMarketRow[];
  focusedId: string;
  lane: DiscoveryLane;
  onSelectMarket: (id: string) => void;
}) {
  const { isWatched } = useTerminal();
  return (
    <section className="turbo-panel editorial-digest-panel">
      <TurboPanelHeader kicker="Digest" title={title} meta={deck} />
      <div className="editorial-digest-list">
        {rows.slice(0, 4).map((row) => (
          <MarketRadarRow
            key={`${title}-${row.id}`}
            row={row}
            lane={lane}
            selected={row.id === focusedId}
            watched={isWatched(row.id)}
            onSelect={() => onSelectMarket(row.id)}
          />
        ))}
        {rows.length === 0 ? <div className="redesign-empty">No markets in this edition block yet.</div> : null}
      </div>
    </section>
  );
}

function EditorialCategoryColumns({
  rows,
  focusedId,
  onSelectMarket,
}: {
  rows: DiscoveryMarketRow[];
  focusedId: string;
  onSelectMarket: (id: string) => void;
}) {
  return (
    <section className="turbo-panel editorial-category-columns">
      <TurboPanelHeader kicker="Sections" title="Politics, macro, crypto, sports and global columns" meta="workspace" />
      <div className="editorial-category-column-grid">
        {EDITORIAL_CATEGORIES.slice(0, 6).map((category) => {
          const categoryRows = rows.filter((row) => editorialCategoryForText(row.question) === category).slice(0, 3);
          const fallbackRows = categoryRows.length ? categoryRows : rows.slice(0, 3);
          return (
            <div key={category} className="editorial-category-column">
              <h3>{category}</h3>
              {fallbackRows.map((row) => (
                <button
                  key={`${category}-${row.id}`}
                  type="button"
                  className={row.id === focusedId ? "is-selected" : ""}
                  onClick={() => onSelectMarket(row.id)}
                >
                  <strong>{shorten(row.question, 72)}</strong>
                  <span>
                    YES {fmtCents(row.yesPrice, 0)} / {fmtUsd(row.volume24hr)}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EditorialNewsFeedPanel({
  sources,
  news,
}: {
  sources: SourceDocument[];
  news: MarketIntelData["news"];
}) {
  const newsRows = Array.isArray(news) ? news.slice(0, 5) : [];
  return (
    <section className="turbo-panel editorial-news-feed">
      <TurboPanelHeader kicker="News" title="Compact news and source feed" meta={`${newsRows.length + sources.length} items`} />
      <div className="editorial-news-list">
        {newsRows.map((item) => (
          <a key={item.id} href={item.link} target="_blank" rel="noreferrer">
            <strong>{shorten(item.title, 88)}</strong>
            <span>{item.feedLabel} / {fmtDateTime(item.publishedAt)}</span>
          </a>
        ))}
        {sources.slice(0, 4).map((source) => (
          <a key={`${source.provider}-${source.externalId}`} href={source.url ?? "#"} target={source.url ? "_blank" : undefined} rel="noreferrer">
            <strong>{shorten(source.title, 88)}</strong>
            <span>{PROVIDER_LABEL[source.provider]} / {sourceCategoryLabel(source.category)}</span>
          </a>
        ))}
        {newsRows.length === 0 && sources.length === 0 ? (
          <div className="redesign-empty">News and source documents appear after the market intel request completes.</div>
        ) : null}
      </div>
    </section>
  );
}

function EditorialMarketBriefingPanel({
  status,
  moveText,
  sourceCount,
  tradeCount,
  dataMode,
  fallbackReason,
}: {
  status: CatalystStatus;
  moveText: string;
  sourceCount: number;
  tradeCount: number;
  dataMode: string | undefined;
  fallbackReason: string | undefined;
}) {
  return (
    <aside className="turbo-panel editorial-market-briefing">
      <TurboPanelHeader
        kicker="Briefing"
        title="Market Briefing"
        meta={dataModeLabel(dataMode, { real: "live", mock: "demo", pending: "checking" })}
      />
      <div className="editorial-briefing-lede">
        <strong>{status.label}</strong>
        <p>{status.detail}</p>
      </div>
      <div className="editorial-briefing-stat-grid">
        <span>Sources <strong>{sourceCount}</strong></span>
        <span>Trades <strong>{tradeCount}</strong></span>
        <span>Mode <strong>{dataModeLabel(dataMode, { real: "real", mock: "mock", pending: "checking" })}</strong></span>
      </div>
      <p>{moveText}</p>
      {fallbackReason ? <em>{fallbackReason}</em> : null}
    </aside>
  );
}

function EditorialHistoricalContextPanel({
  row,
  sources,
  newsCount,
}: {
  row: DiscoveryMarketRow | undefined;
  sources: SourceDocument[];
  newsCount: number;
}) {
  return (
    <section className="turbo-panel editorial-history-block">
      <TurboPanelHeader kicker="Context" title="Historical context" meta={row?.createdAt ? fmtDateTime(row.createdAt) : "indexed"} />
      <p>
        This brief keeps the market question, deadline, source density, volume, and liquidity in one article-style
        context block so the reader can separate durable background from live tape noise.
      </p>
      <div className="editorial-briefing-stat-grid">
        <span>Created <strong>{fmtDateTime(row?.createdAt)}</strong></span>
        <span>Deadline <strong>{fmtDateTime(row?.endDate)}</strong></span>
        <span>Sources <strong>{sources.length}</strong></span>
        <span>News <strong>{newsCount}</strong></span>
      </div>
    </section>
  );
}

function EditorialActivityPanel({
  trades,
  events,
}: {
  trades: MarketIntelData["trades"];
  events: AlertEvent[];
}) {
  return (
    <section className="turbo-panel editorial-activity-block">
      <TurboPanelHeader kicker="Activity" title="Comments and market activity" meta={`${trades.length} prints`} />
      <div className="editorial-activity-list">
        {events.slice(0, 3).map((event) => (
          <article key={event.id}>
            <strong>{event.title}</strong>
            <span>{event.body}</span>
          </article>
        ))}
        {trades.slice(0, 5).map((trade) => (
          <article key={`${trade.timestamp}-${trade.price}-${trade.size}`}>
            <strong>{trade.side} {trade.outcome ?? "outcome"} at {fmtCents(trade.price, 1)}</strong>
            <span>{fmtUsd(trade.notional)} notional / {fmtTime(trade.timestamp)}</span>
          </article>
        ))}
        {events.length === 0 && trades.length === 0 ? (
          <div className="redesign-empty">Activity appears when public trades or local alert events are available.</div>
        ) : null}
      </div>
    </section>
  );
}

function MarketHeader({
  focusedId,
  row,
  title,
  category,
  closingHrs,
  endDate,
  yes,
  no,
  movePct,
  volume24h,
  liquidity,
  slug,
  eventSlug,
  polymarketUrl,
}: {
  focusedId: string;
  row: DiscoveryMarketRow | undefined;
  title: string;
  category: string | null | undefined;
  closingHrs: number | null;
  endDate: string | null | undefined;
  yes: number | null;
  no: number | null;
  movePct: number | null;
  volume24h: number | null | undefined;
  liquidity: number | null | undefined;
  slug?: string | null;
  eventSlug?: string | null;
  polymarketUrl?: string | null;
}) {
  const { result, loading, runExplainWithId, isWatched, toggleWatchlist } = useTerminal();
  const saveWorkspace = useSaveWorkspacePatch();
  const [copied, setCopied] = useState(false);
  const catalystReady = result?.marketId === focusedId;
  const status = catalystStatus(result, focusedId);

  async function copyShare() {
    const href = typeof window === "undefined" ? "" : window.location.href;
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <header className="redesign-market-header">
      <div className="redesign-market-title">
        <div className="redesign-breadcrumb">
          <span>Prediction market</span>
          <span>#{focusedId}</span>
          <span>{category ?? "General"}</span>
        </div>
        <h1>{title}</h1>
        <div className="redesign-chip-row">
          <Badge tone="blue">{endDate ? `Closes ${fmtDateTime(endDate)}` : "No deadline"}</Badge>
          <Badge tone={closingHrs != null && closingHrs < 24 ? "warn" : "neutral"}>
            {closingHrs != null ? `${fmtHours(closingHrs)} left` : "Open timeline"}
          </Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <div className="redesign-price-stack" aria-label="YES and NO prices">
        <div className="is-yes">
          <span>YES</span>
          <strong>{fmtCents(yes, 1)}</strong>
        </div>
        <div className="is-no">
          <span>NO</span>
          <strong>{fmtCents(no, 1)}</strong>
        </div>
      </div>

      <div className="redesign-header-actions">
        <button
          type="button"
          className="redesign-primary-button"
          disabled={loading}
          onClick={() => void runExplainWithId(focusedId)}
        >
          {loading ? "Analyzing" : catalystReady ? "Refresh match" : "Analyze move"}
        </button>
        <button
          type="button"
          className={`redesign-secondary-button ${isWatched(focusedId) ? "is-active" : ""}`}
          onClick={() => toggleWatchlist(focusedId)}
        >
          {isWatched(focusedId) ? "Watching" : "Watch"}
        </button>
        <button type="button" className="redesign-secondary-button" onClick={() => void copyShare()}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          className="redesign-secondary-button"
          disabled={saveWorkspace.isPending}
          onClick={() =>
            saveWorkspace.mutate({
              savedMarket: {
                marketId: focusedId,
                marketTitle: title,
                folder: "Catalyst Timeline",
                tags: ["timeline", catalystReady ? "catalyst" : "brief"],
                thesis: catalystReady ? result.explanation : null,
              },
            })
          }
        >
          {saveWorkspace.isPending ? "Clipping" : "Clip brief"}
        </button>
        <a
          className="redesign-secondary-button"
          href={marketPolymarketHref({
            polymarketUrl: polymarketUrl ?? row?.polymarketUrl,
            eventSlug: eventSlug ?? row?.eventSlug,
            slug: slug ?? row?.slug,
            question: title,
            id: focusedId,
          })}
          target="_blank"
          rel="noreferrer"
        >
          Source market
        </a>
      </div>

      <div className="redesign-header-metrics">
        <MetricTile
          label="Session"
          value={fmtPct(movePct, { sign: true })}
          tone={movePct != null && movePct > 0 ? "up" : movePct != null && movePct < 0 ? "down" : "neutral"}
        />
        <MetricTile label="24h volume" value={fmtUsd(volume24h)} />
        <MetricTile label="Liquidity" value={fmtUsd(liquidity)} />
      </div>
    </header>
  );
}

function ChartPanel({
  history,
  markers,
  moveText,
  loading,
}: {
  history: { t: number; p: number }[] | undefined;
  markers: ChartMarker[];
  moveText: string;
  loading: boolean;
}) {
  return (
    <section className="redesign-chart-panel">
      <div className="redesign-panel-head">
        <div>
          <span>Price path</span>
          <h2>Price, volume, then evidence</h2>
        </div>
        <Badge tone="blue">YES vs NO</Badge>
      </div>
      {history?.length ? (
        <PriceChart
          history={history}
          showNo
          height={330}
          markers={markers}
          className="redesign-price-chart"
        />
      ) : (
        <div className="redesign-empty">{loading ? "Loading price path..." : "No price path yet."}</div>
      )}
      <div className="redesign-move-brief">
        <span>Detected move</span>
        <strong>{moveText}</strong>
      </div>
    </section>
  );
}

function TurboPanelHeader({
  kicker,
  title,
  meta,
}: {
  kicker: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div className="turbo-panel-head">
      <div>
        <span>{kicker}</span>
        <h3>{title}</h3>
      </div>
      {meta ? <em>{meta}</em> : null}
    </div>
  );
}

function SignalAutopilotPanel({ actions }: { actions: TurboAction[] }) {
  return (
    <section className="turbo-panel turbo-autopilot">
      <TurboPanelHeader kicker="Turbo 01" title="Signal Autopilot" meta="next best action" />
      <div className="turbo-action-stack">
        {actions.map((action, index) => (
          <article
            key={action.id}
            className={index === 0 ? "is-primary" : ""}
          >
            <strong>{action.label}</strong>
            <span>{action.reason}</span>
            <em>{action.priority}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function WarRoomPanel({ checklist }: { checklist: WarRoomChecklistItem[] }) {
  return (
    <section className="turbo-panel turbo-war-room">
      <TurboPanelHeader kicker="Turbo 02" title="Catalyst War Room" meta={`${checklist.filter((item) => item.ready).length}/${checklist.length} ready`} />
      <div className="turbo-checklist">
        {checklist.map((item) => (
          <div key={item.id} className={item.ready ? "is-ready" : ""}>
            <i />
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MarketReplayPanel({ frames }: { frames: ReplayFrame[] }) {
  const active = frames.at(-1);
  return (
    <section className="turbo-panel turbo-replay">
      <TurboPanelHeader kicker="Turbo 03" title="Market Replay" meta={active ? `${frames.length} frames` : "waiting"} />
      {frames.length ? (
        <>
          <div className="turbo-replay-track">
            {frames.map((frame) => (
              <span
                key={`${frame.time}-${frame.index}`}
                style={{ height: `${Math.max(12, Math.min(100, frame.price * 100))}%` }}
                className={frame.delta >= 0 ? "is-up" : "is-down"}
              />
            ))}
          </div>
          <p>{active?.events[0] ?? "Price path ready; no source event in the active frame."}</p>
        </>
      ) : (
        <div className="redesign-empty">Replay appears after price history loads.</div>
      )}
    </section>
  );
}

function SmartAlertPanel({ draft }: { draft: SmartAlertDraft }) {
  return (
    <section className="turbo-panel turbo-alert-builder">
      <TurboPanelHeader kicker="Turbo 04" title="Smart Alert Builder" meta={draft.enabled ? "armed draft" : "draft"} />
      <p>{draft.summary}</p>
      <div className="turbo-rule-grid">
        {draft.rules.map((rule) => (
          <span key={rule.metric}>
            {rule.metric} {rule.operator} {rule.value.toLocaleString()}{rule.unit}
          </span>
        ))}
      </div>
    </section>
  );
}

function EvidenceConfidencePanel({ items }: { items: EvidenceConfidenceItem[] }) {
  return (
    <section className="turbo-panel turbo-confidence-engine">
      <TurboPanelHeader kicker="Turbo 05" title="Evidence Confidence Engine" meta={`${items.length} scored`} />
      <div className="turbo-confidence-list">
        {items.slice(0, 5).map((item) => (
          <article key={`${item.provider}-${item.title}`}>
            <strong>{shorten(item.title, 72)}</strong>
            <span>{item.provider} / {item.reasons.slice(0, 2).join(" / ")}</span>
            <i><b style={{ width: `${item.score}%` }} /></i>
            <em>{item.score.toFixed(0)}</em>
          </article>
        ))}
        {items.length === 0 ? <div className="redesign-empty">Sources will be scored when loaded.</div> : null}
      </div>
    </section>
  );
}

function RelatedGraphPanel({ graph }: { graph: RelatedMarketGraph }) {
  return (
    <section className="turbo-panel turbo-related-graph">
      <TurboPanelHeader kicker="Turbo 06" title="Related Market Graph" meta={`${graph.links.length} links`} />
      <div className="turbo-graph">
        {graph.nodes.slice(0, 7).map((node) => (
          <span key={node.id} className={`is-${node.tone}`}>
            {shorten(node.label, node.tone === "focus" ? 18 : 28)}
          </span>
        ))}
      </div>
      <div className="turbo-link-stack">
        {graph.links.slice(0, 4).map((link) => (
          <span key={`${link.source}-${link.target}`} className={`is-${link.tone}`}>
            {link.tone} / {link.weight.toFixed(0)} strength
          </span>
        ))}
        {graph.links.length === 0 ? <span>No related links until catalyst analysis runs.</span> : null}
      </div>
    </section>
  );
}

function TapeIntelligencePanel({ signals }: { signals: TapeSignal[] }) {
  return (
    <section className="turbo-panel turbo-tape-intelligence">
      <TurboPanelHeader kicker="Turbo 07" title="Trade Tape Intelligence" meta={`${signals.length} signals`} />
      <div className="turbo-signal-stack">
        {signals.map((signal) => (
          <article key={signal.id} className={`is-${signal.tone}`}>
            <strong>{signal.label}</strong>
            <span>{signal.detail}</span>
          </article>
        ))}
        {signals.length === 0 ? <div className="redesign-empty">No strong tape anomaly in the current prints.</div> : null}
      </div>
    </section>
  );
}

function MovementScannerPanel({
  moves,
  scores,
}: {
  moves: MarketMove[];
  scores: MarketScores | undefined;
}) {
  const topMove = moves[0];
  const moveCents = topMove ? (topMove.probabilityAfter - topMove.probabilityBefore) * 100 : null;
  const threshold =
    topMove && topMove.probabilityBefore < 0.5 && topMove.probabilityAfter >= 0.5
      ? "Crossed 50%"
      : topMove && topMove.probabilityBefore < 0.7 && topMove.probabilityAfter >= 0.7
        ? "Crossed 70%"
        : topMove && topMove.probabilityBefore < 0.9 && topMove.probabilityAfter >= 0.9
          ? "Crossed 90%"
          : "Watching thresholds";

  return (
    <section className="turbo-panel turbo-movement-scanner">
      <TurboPanelHeader
        kicker="Scan"
        title="Movement Scanner"
        meta={moveCents == null ? "waiting" : `${moveCents >= 0 ? "+" : ""}${moveCents.toFixed(1)}c`}
      />
      <div className="terminal-signal-grid">
        <span>
          Volatility <strong>{scores?.volatilityScore ?? 0}</strong>
        </span>
        <span>
          Momentum <strong>{scores?.momentumScore ?? 0}</strong>
        </span>
        <span>
          Volume <strong>{scores?.unusualVolumeScore ?? 0}</strong>
        </span>
      </div>
      {topMove ? (
        <div className="terminal-move-card">
          <strong>{threshold}</strong>
          <span>
            {fmtCents(topMove.probabilityBefore, 1)} to {fmtCents(topMove.probabilityAfter, 1)}
            {" / "}
            {fmtUsd(topMove.volumeUsd)} in {topMove.windowMinutes}m
          </span>
        </div>
      ) : (
        <div className="redesign-empty">No sudden move isolated yet.</div>
      )}
    </section>
  );
}

function WhaleTrackerPanel({
  wallets,
  dataMode,
}: {
  wallets: WalletActivity[];
  dataMode: string | undefined;
}) {
  const sorted = [...wallets].sort((a, b) => b.notionalUsd - a.notionalUsd).slice(0, 6);
  const emptyCopy =
    dataMode === "mock"
      ? "Demo fallback is active; mock wallet rows remain labeled as demo data."
      : "No public wallet flow available for this live market yet.";
  return (
    <section className="turbo-panel terminal-whale-panel">
      <TurboPanelHeader kicker="Flow" title="Whale Tracker" meta={`${sorted.length} wallets`} />
      <div className="terminal-whale-stack">
        {sorted.map((wallet) => (
          <article key={wallet.id}>
            <div>
              <strong>{wallet.label ?? `${wallet.walletAddress.slice(0, 6)}...${wallet.walletAddress.slice(-4)}`}</strong>
              <span>{wallet.walletAddress}</span>
            </div>
            <em className={wallet.side === "BUY" ? "is-up" : "is-down"}>
              {wallet.side} {wallet.outcome}
            </em>
            <b>{fmtUsd(wallet.notionalUsd)}</b>
          </article>
        ))}
        {sorted.length === 0 ? (
          <div className="redesign-empty">{emptyCopy}</div>
        ) : null}
      </div>
    </section>
  );
}

function WatchlistBoardPanel({
  rows,
  focusedId,
  onSelectMarket,
}: {
  rows: DiscoveryMarketRow[];
  focusedId: string;
  onSelectMarket: (id: string) => void;
}) {
  const { watchlist, removeFromWatchlist, clearWatchlist } = useTerminal();
  const watchedRows = watchlist
    .map((id) => rows.find((row) => row.id === id) ?? null)
    .filter((row): row is DiscoveryMarketRow => row !== null);

  return (
    <section className="turbo-panel terminal-watchlist-panel">
      <TurboPanelHeader
        kicker="Watchlist"
        title="Local Watchlist"
        meta={`${watchlist.length}/24 pins`}
      />
      <div className="terminal-whale-stack">
        {watchedRows.slice(0, 6).map((row) => (
          <article key={row.id}>
            <div>
              <strong>{shorten(row.question, 78)}</strong>
              <span>#{row.id} / YES {fmtCents(row.yesPrice, 0)} / {fmtUsd(row.volume24hr)}</span>
            </div>
            <button type="button" onClick={() => onSelectMarket(row.id)}>
              {row.id === focusedId ? "Open" : "Focus"}
            </button>
            <button type="button" onClick={() => removeFromWatchlist(row.id)} aria-label={`Remove ${row.id}`}>
              x
            </button>
          </article>
        ))}
        {!watchedRows.length ? (
          <div className="redesign-empty">Pinned markets appear here. Use +, PIN, or WATCH commands.</div>
        ) : null}
      </div>
      {watchlist.length ? (
        <button type="button" className="redesign-secondary-button" onClick={clearWatchlist}>
          Clear watchlist
        </button>
      ) : null}
    </section>
  );
}

function LocalAlertsPanel({
  marketId,
  marketTitle,
  draft,
  rules,
  events,
}: {
  marketId: string;
  marketTitle: string;
  draft: SmartAlertDraft;
  rules: AlertRule[];
  events: AlertEvent[];
}) {
  const { alertRules: localRules, addAlertRule, removeAlertRule } = useTerminal();
  const combinedRules = [...localRules, ...rules].slice(0, 8);
  const createDraftRule = () => {
    addAlertRule(buildLocalAlertRuleFromDraft({ marketId, marketTitle, draft }));
  };

  return (
    <section className="turbo-panel terminal-alerts-panel">
      <TurboPanelHeader kicker="Alerts" title="Local Alert Center" meta={`${events.length} events`} />
      <div className="terminal-alert-draft-strip">
        <strong>Suggested alert from this market move</strong>
        <span>read-only rule</span>
        <button type="button" onClick={createDraftRule}>
          Create local draft
        </button>
      </div>
      <details className="terminal-alert-manual-rule">
        <summary>Manual local rule</summary>
        <AlertRuleForm marketId={marketId} onCreate={addAlertRule} />
      </details>
      <div className="terminal-alert-stack">
        {events.slice(0, 4).map((event) => (
          <article key={event.id} className={`is-${event.severity}`}>
            <strong>{event.title}</strong>
            <span>{event.body}</span>
          </article>
        ))}
        {events.length === 0 ? (
          <article>
            <strong>{draft.enabled ? "Draft armed" : "Draft rule"}</strong>
            <span>{draft.summary}</span>
          </article>
        ) : null}
      </div>
      <div className="terminal-rule-list">
        {combinedRules.map((rule) => (
          <span key={rule.id}>
            {rule.name} / {rule.enabled ? "on" : "off"}
            {localRules.some((local) => local.id === rule.id) ? (
              <button type="button" onClick={() => removeAlertRule(rule.id)} aria-label={`Remove ${rule.name}`}>
                x
              </button>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}

function DataSourcesPanel({
  status,
  dataMode,
  fallbackReason,
  sourceCount,
  newsCount,
  sourceHealth,
  onOpenProvenance,
}: {
  status: MarketSourceStatus | undefined;
  dataMode: string | undefined;
  fallbackReason: string | undefined;
  sourceCount: number;
  newsCount: number;
  sourceHealth?: DataSourceStatus[];
  onOpenProvenance?: (request: ProvenanceDrawerRequest) => void;
}) {
  return (
    <section className="turbo-panel terminal-system-panel">
      <TurboPanelHeader
        kicker="System"
        title="Data Sources / Status"
        meta={dataModeLabel(dataMode, { real: "live", mock: "demo fallback", pending: "checking" })}
      />
      <SystemStatusPanel status={status} dataMode={dataMode} fallbackReason={fallbackReason} />
      <div className="terminal-system-grid">
        <span>
          Sources <strong>{sourceCount}</strong>
        </span>
        <span>
          Headlines <strong>{newsCount}</strong>
        </span>
      </div>
      <div className="terminal-system-grid" aria-label="Source health">
        {(sourceHealth ?? []).slice(0, 6).map((source) => (
          <button
            type="button"
            key={source.sourceId}
            onClick={() =>
              onOpenProvenance?.({
                kind: "source-health",
                title: `${source.sourceId} source health`,
                sourceHealth: source,
              })
            }
          >
            {source.sourceId}{" "}
            <strong>{source.health}</strong>
            <small>
              {source.lastSuccessAt ? ` last ${fmtTime(source.lastSuccessAt)}` : " no success"} /{" "}
              {source.consecutiveFailures} failures
            </small>
          </button>
        ))}
      </div>
      <p>{status?.message ?? "Public market data is requested through read-only adapters."}</p>
    </section>
  );
}

function SourceLibraryPanel({
  sources,
  normalizedNews,
  onOpenProvenance,
}: {
  sources: SourceDocument[];
  normalizedNews?: NewsItem[];
  onOpenProvenance?: (request: ProvenanceDrawerRequest) => void;
}) {
  const provenanceByExternalId = new Map(
    (normalizedNews ?? []).map((item) => [item.externalId, item.provenance[0]]),
  );
  return (
    <section className="turbo-panel terminal-source-library">
      <TurboPanelHeader kicker="Sources" title="Evidence Library" meta={`${sources.length} indexed`} />
      <div className="terminal-source-list">
        {sources.slice(0, 14).map((source) => {
          const provenance = provenanceByExternalId.get(source.externalId);
          return (
            <article
              key={`${source.provider}:${source.externalId}`}
              className="terminal-source-row"
            >
              <span>
                <Badge tone="blue">{PROVIDER_LABEL[source.provider]}</Badge>
                <Badge>{sourceOriginLabel(source.origin)}</Badge>
                <em>{sourceCategoryLabel(source.category)}</em>
              </span>
              <strong>{shorten(source.title, 110)}</strong>
              <p>{shorten(source.summary ?? "Source document matched to the selected market.", 150)}</p>
              <small>
                {sourceReliabilityLabel(source.reliability)} confidence
                {provenance ? ` / Checksum ${provenance.checksumSha256.slice(0, 10)}` : ""}
              </small>
              <span className="terminal-source-actions">
                <button
                  type="button"
                  onClick={() =>
                    onOpenProvenance?.({
                      kind: "source",
                      title: source.title,
                      source,
                    })
                  }
                >
                  Provenance
                </button>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    Raw links
                  </a>
                ) : null}
              </span>
            </article>
          );
        })}
        {sources.length === 0 ? (
          <div className="redesign-empty">No normalized sources loaded for this market yet. Live unavailable, demo data shown when fallback mode is active.</div>
        ) : null}
      </div>
    </section>
  );
}

function SourceProvenanceDrawer({
  request,
  focusedId,
  sources,
  normalizedNews,
  candidates,
  sourceHealth,
  onClose,
}: {
  request: ProvenanceDrawerRequest | null;
  focusedId: string;
  sources: SourceDocument[];
  normalizedNews?: NewsItem[];
  candidates?: WhyMovedCandidate[];
  sourceHealth?: DataSourceStatus[];
  onClose: () => void;
}) {
  if (!request) return null;
  const newsByExternalId = new Map((normalizedNews ?? []).map((item) => [item.externalId, item]));
  const selectedSources =
    request.source ? [request.source] :
    request.kind === "market-row" && request.row?.id !== focusedId ? [] :
    sources.slice(0, 8);
  const provenance = selectedSources.flatMap((source) => newsByExternalId.get(source.externalId)?.provenance ?? []);
  const selectedCandidates = request.candidate ? [request.candidate] : (candidates ?? []).slice(0, 4);
  const healthRows = request.sourceHealth ? [request.sourceHealth] : (sourceHealth ?? []).slice(0, 4);

  return (
    <>
      <button type="button" className="terminal-provenance-backdrop" aria-label="Close provenance drawer" onClick={onClose} />
      <aside className="terminal-provenance-drawer" role="dialog" aria-modal="true" aria-label="Source provenance drawer">
        <header>
          <span>Source provenance</span>
          <strong>{shorten(request.title, 86)}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        <section>
          <h4>Raw links</h4>
          {selectedSources.length ? selectedSources.map((source) => (
            <a key={`${source.provider}:${source.externalId}`} href={source.url ?? "#"} target={source.url ? "_blank" : undefined} rel="noreferrer">
              <strong>{shorten(source.title, 84)}</strong>
              <span>{PROVIDER_LABEL[source.provider]} / {sourceCategoryLabel(source.category)}</span>
            </a>
          )) : (
            <p>No raw links are loaded for this row yet. Open the market detail to fetch normalized source documents.</p>
          )}
        </section>

        <section>
          <h4>checksum and adapter</h4>
          {provenance.length ? provenance.slice(0, 8).map((ref) => (
            <div key={`${ref.sourceId}:${ref.externalId}:${ref.checksumSha256}`}>
              <strong>{ref.sourceId}</strong>
              <span>checksum {ref.checksumSha256.slice(0, 16)}</span>
              <span>adapter {ref.adapterVersion}</span>
              <span>{ref.rawBlobKey}</span>
            </div>
          )) : (
            <p>checksum and adapter metadata will appear when normalized provenance refs are available.</p>
          )}
        </section>

        <section>
          <h4>score breakdown</h4>
          {selectedCandidates.length ? selectedCandidates.map((candidate) => (
            <div key={candidate.id}>
              <strong>{candidate.eventId}</strong>
              <span>Evidence status {phraseToken(candidate.evidenceStatus)}</span>
              <span>Move quality {candidate.moveQuality.label} / {fmtPct(candidate.moveQuality.score * 100, { digits: 0 })}</span>
              <span>Market divergence {candidateDivergenceLabel(candidate)}</span>
              <span>Conflicting evidence {candidateConflictLabel(candidate)}</span>
              <span>lexical {fmtPct(candidate.scoreBreakdown.lexical * 100, { digits: 0 })}</span>
              <span>entity {fmtPct(candidate.scoreBreakdown.entity * 100, { digits: 0 })}</span>
              <span>time {fmtPct(candidate.scoreBreakdown.time * 100, { digits: 0 })}</span>
              <span>source {fmtPct(candidate.scoreBreakdown.source * 100, { digits: 0 })}</span>
              <span>reaction {fmtPct(candidate.scoreBreakdown.marketReaction * 100, { digits: 0 })}</span>
            </div>
          )) : (
            <p>No score breakdown has been replayed for this market row yet.</p>
          )}
        </section>

        <section>
          <h4>Adapter health</h4>
          {healthRows.map((health) => (
            <div key={health.sourceId}>
              <strong>{health.sourceId}</strong>
              <span>{health.health}</span>
              <span>{health.lastSuccessAt ? `last ${fmtTime(health.lastSuccessAt)}` : "no success timestamp"}</span>
            </div>
          ))}
        </section>
      </aside>
    </>
  );
}

function LiquiditySummaryPanel({
  book,
}: {
  book: {
    bestBid?: number | null;
    bestAsk?: number | null;
    spread?: number | null;
    depthImbalance?: number | null;
    bidDepth?: number | null;
    askDepth?: number | null;
    lastTradePrice?: number | null;
  } | null;
}) {
  return (
    <section className="turbo-panel terminal-liquidity-panel">
      <TurboPanelHeader
        kicker="CLOB"
        title="Liquidity"
        meta={book?.spread != null ? `${fmtCents(book.spread, 2)} spread` : "no book"}
      />
      <div className="redesign-book-grid terminal-liquidity-grid">
        <MetricTile label="Best bid" value={fmtCents(book?.bestBid, 1)} tone="up" />
        <MetricTile label="Best ask" value={fmtCents(book?.bestAsk, 1)} tone="down" />
        <MetricTile label="Last" value={fmtCents(book?.lastTradePrice, 1)} />
        <MetricTile label="Bid depth" value={fmtUsd(book?.bidDepth)} />
        <MetricTile label="Ask depth" value={fmtUsd(book?.askDepth)} />
        <MetricTile
          label="Imbalance"
          value={fmtPct(book?.depthImbalance != null ? book.depthImbalance * 100 : null, {
            sign: true,
          })}
        />
      </div>
    </section>
  );
}

function DecisionJournalPanel({ journal }: { journal: DecisionJournalDraft }) {
  return (
    <section className="turbo-panel turbo-decision-journal">
      <TurboPanelHeader kicker="Turbo 08" title="Decision Journal" meta={journal.marketId} />
      <strong>{shorten(journal.title, 74)}</strong>
      <p>{journal.thesis}</p>
      <div className="turbo-tag-row">
        {journal.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
    </section>
  );
}

function OpportunityHeatmapPanel({ cells }: { cells: HeatmapCell[] }) {
  return (
    <section className="turbo-panel turbo-opportunity-heatmap">
      <TurboPanelHeader kicker="Turbo 09" title="Opportunity Heatmap" meta="lane pulse" />
      <div className="turbo-heatmap-grid">
        {cells.map((cell) => (
          <article key={cell.id}>
            <i style={{ opacity: Math.max(0.22, cell.intensity / 100) }} />
            <strong>{cell.label}</strong>
            <span>{cell.intensity.toFixed(0)}</span>
            <em>{cell.detail}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function PowerConsolePanel({ suggestions }: { suggestions: CommandSuggestion[] }) {
  return (
    <section className="turbo-panel turbo-power-console">
      <TurboPanelHeader kicker="Turbo 10" title="Power Console" meta="Cmd+K brain" />
      <div className="turbo-command-stack">
        {suggestions.slice(0, 5).map((suggestion) => (
          <button key={suggestion.command} type="button">
            <code>{suggestion.command}</code>
            <span>{suggestion.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TimelinePanel({
  items,
  isLoading,
}: {
  items: TimelineItem[];
  isLoading: boolean;
}) {
  return (
    <section className="redesign-timeline-panel">
      <div className="redesign-panel-head">
        <div>
          <span>Catalyst timeline</span>
          <h2>Evidence around the move window</h2>
        </div>
        <Badge tone={items.length ? "up" : "neutral"}>{items.length} items</Badge>
      </div>

      <div className="redesign-timeline-table">
        <div className="redesign-timeline-head" aria-hidden="true">
          <span>Time</span>
          <span>Source</span>
          <span>Impact</span>
          <span>Confidence</span>
        </div>
        {isLoading ? (
          <div className="redesign-empty">Loading timeline...</div>
        ) : items.length ? (
          items.map((item) => <TimelineRow key={item.id} item={item} />)
        ) : (
          <div className="redesign-empty">Analyze the move to line up price, news, sources, and tape.</div>
        )}
      </div>
    </section>
  );
}

function SignalBreakdownPanel({
  focusedId,
  result,
}: {
  focusedId: string;
  result: MarketMoveExplanation | null;
}) {
  const ready = result?.marketId === focusedId;
  const top = ready ? result.likelyCatalysts[0] : null;
  const rows = breakdownRows(top?.scoringBreakdown);

  return (
    <section className="redesign-breakdown-panel">
      <div className="redesign-panel-head">
        <div>
          <span>Signal breakdown</span>
          <h2>Why this candidate ranked here</h2>
        </div>
        <Badge tone={top ? "blue" : "neutral"}>{top ? sourceCategoryLabel(top.source) : "No match"}</Badge>
      </div>
      {rows.length ? (
        <div className="redesign-score-stack">
          {rows.map((row) => (
            <ScoreBar key={row.label} label={row.label} value={row.value} note={row.note} />
          ))}
        </div>
      ) : (
        <div className="redesign-empty">
          No scoring breakdown yet. Analyze the move after sources load.
        </div>
      )}
    </section>
  );
}

function WhyMovedCandidatesPanel({
  candidates,
  onOpenProvenance,
}: {
  candidates?: WhyMovedCandidate[];
  onOpenProvenance?: (request: ProvenanceDrawerRequest) => void;
}) {
  const top = (candidates ?? []).slice(0, 4);
  return (
    <section className="redesign-breakdown-panel">
      <div className="redesign-panel-head">
        <div>
          <span>Why-moved candidates</span>
          <h2>Replayable score components</h2>
        </div>
        <Badge tone={top.length ? "up" : "neutral"}>{top.length} candidates</Badge>
      </div>
      {top.length ? (
        <div className="redesign-score-stack">
          {top.map((candidate) => (
            <button
              type="button"
              key={candidate.id}
              className="terminal-source-row terminal-candidate-provenance"
              onClick={() =>
                onOpenProvenance?.({
                  kind: "candidate",
                  title: `Why moved: ${candidate.eventId}`,
                  candidate,
                })
              }
            >
              <span>
                <Badge tone={candidate.direction === "yes" ? "up" : candidate.direction === "no" ? "down" : "neutral"}>
                  {candidate.direction.toUpperCase()}
                </Badge>
                <Badge tone={candidateEvidenceTone(candidate)}>Evidence status {phraseToken(candidate.evidenceStatus)}</Badge>
                <em>{fmtPct(candidate.confidence * 100, { digits: 0 })}</em>
              </span>
              <strong>{candidate.eventId}</strong>
              <p>{candidate.reasons.slice(0, 4).join(" / ")}</p>
              <p>
                Move quality {candidate.moveQuality.label} ({fmtPct(candidate.moveQuality.score * 100, { digits: 0 })}) / Market
                divergence {candidateDivergenceLabel(candidate)} / Conflicting evidence {candidateConflictLabel(candidate)}
              </p>
              <small>
                lexical {fmtPct(candidate.scoreBreakdown.lexical * 100, { digits: 0 })} / source{" "}
                {fmtPct(candidate.scoreBreakdown.source * 100, { digits: 0 })} / reaction{" "}
                {fmtPct(candidate.scoreBreakdown.marketReaction * 100, { digits: 0 })}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <div className="redesign-empty">No replayable why-moved candidates for this market window yet.</div>
      )}
    </section>
  );
}

function ScoreBar({ label, value, note }: { label: string; value: number; note: string }) {
  const pct = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  return (
    <div className="redesign-score-row">
      <div>
        <strong>{label}</strong>
        <span>{note}</span>
      </div>
      <i>
        <b style={{ width: `${pct}%` }} />
      </i>
      <em>{pct.toFixed(0)}%</em>
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const content = (
    <>
      <time>{item.timeLabel}</time>
      <div className="redesign-timeline-main">
        <div className="redesign-source-line">
          {item.provider ? <Badge tone="blue">{item.provider}</Badge> : null}
          {item.origin ? <Badge>{item.origin}</Badge> : null}
          {item.category ? <span>{item.category}</span> : null}
        </div>
        <strong>{item.title}</strong>
        <p>{shorten(item.detail, 180)}</p>
      </div>
      <span className={`redesign-impact is-${item.tone}`}>{item.impact}</span>
      <span className="redesign-confidence">{item.confidence}</span>
    </>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className="redesign-timeline-row">
        {content}
      </a>
    );
  }

  return <div className="redesign-timeline-row">{content}</div>;
}

function DecisionRail({
  focusedId,
  yes,
  no,
  intel,
  autopilot,
  alertDraft,
  journal,
  commands,
}: {
  focusedId: string;
  yes: number | null;
  no: number | null;
  intel: ReturnType<typeof useMarketIntel>["data"];
  autopilot: TurboAction[];
  alertDraft: SmartAlertDraft;
  journal: DecisionJournalDraft;
  commands: CommandSuggestion[];
}) {
  const { result, error } = useTerminal();
  const { data: ledger } = useSourceLedger(focusedId);
  const { data: reports } = useResearchReports();
  const catalystReady = result?.marketId === focusedId;
  const top = catalystReady ? result.likelyCatalysts[0] : null;
  const status = catalystStatus(result, focusedId);
  const book = intel?.orderBook?.summary ?? null;
  const sourceCount = intel?.sources.length ?? 0;
  const ledgerCount = ledger?.items.length ?? 0;
  const reportCount = reports?.items.filter((report) => report.marketIds.includes(focusedId)).length ?? 0;

  return (
    <aside className="redesign-right-rail terminal-action-grid">
      <SignalAutopilotPanel actions={autopilot} />
      <section className="redesign-decision-card">
        <div className="redesign-section-heading">
          <span>Decision</span>
          <strong>{status.label}</strong>
          <em>{catalystReady ? fmtPct(result.confidence, { digits: 0 }) : "WHY"}</em>
        </div>
        <div className="redesign-probability-bars">
          <ProbabilityBar label="YES" value={yes} tone="up" />
          <ProbabilityBar label="NO" value={no} tone="down" />
        </div>
        {top ? (
          <div className="redesign-top-catalyst">
            <Badge tone={top.direction === "YES" ? "up" : top.direction === "NO" ? "down" : "warn"}>
              {top.direction}
            </Badge>
            <strong>{top.title}</strong>
            <p>{shorten(top.summary || top.evidence[0], 130)}</p>
          </div>
        ) : (
          <p className="redesign-mini-copy">
            {status.detail}
          </p>
        )}
        {error ? <div className="redesign-error">{error}</div> : null}
      </section>

      <SmartAlertPanel draft={alertDraft} />
      <DecisionJournalPanel journal={journal} />
      <PowerConsolePanel suggestions={commands} />

      <RelatedMarketsPanel focusedId={focusedId} result={result} />

      <section className="redesign-rail-panel">
        <div className="redesign-section-heading">
          <span>Liquidity</span>
          <strong>{book?.spread != null ? `${fmtCents(book.spread, 2)} spread` : "No book"}</strong>
          <em>CLOB</em>
        </div>
        <div className="redesign-book-grid terminal-liquidity-grid">
          <MetricTile label="Best bid" value={fmtCents(book?.bestBid, 1)} tone="up" />
          <MetricTile label="Best ask" value={fmtCents(book?.bestAsk, 1)} tone="down" />
          <MetricTile
            label="Imbalance"
            value={fmtPct(book?.depthImbalance != null ? book.depthImbalance * 100 : null, {
              sign: true,
            })}
          />
        </div>
      </section>

      <section className="redesign-rail-panel">
        <div className="redesign-section-heading">
          <span>Sources</span>
          <strong>{sourceCount} indexed</strong>
          <em>{ledgerCount + reportCount} saved</em>
        </div>
        <div className="redesign-source-stack">
          {(intel?.sources.slice(0, 5) ?? []).map((source) => (
            <a
              key={`${source.provider}:${source.externalId}`}
              href={source.url ?? "#"}
              target={source.url ? "_blank" : undefined}
              rel="noreferrer"
              className="redesign-source-item"
            >
              <span>
                <Badge tone="blue">{PROVIDER_LABEL[source.provider]}</Badge>
                <Badge>{sourceOriginLabel(source.origin)}</Badge>
              </span>
              <strong>{shorten(source.title, 82)}</strong>
              <em>
                {sourceCategoryLabel(source.category)} / {sourceReliabilityLabel(source.reliability)}
              </em>
            </a>
          ))}
          {sourceCount === 0 ? <p className="redesign-mini-copy">No normalized sources loaded.</p> : null}
        </div>
      </section>

      <section className="redesign-rail-panel">
        <div className="redesign-section-heading">
          <span>Research</span>
          <strong>{reportCount} reports</strong>
          <em>{ledgerCount} ledger</em>
        </div>
        <p className="redesign-mini-copy">
          Research artifacts are summarized here; save, share, and external-market actions live in the article header.
        </p>
      </section>
    </aside>
  );
}

function RelatedMarketsPanel({
  focusedId,
  result,
}: {
  focusedId: string;
  result: MarketMoveExplanation | null;
}) {
  const related = result?.marketId === focusedId ? result.relatedMarkets.slice(0, 5) : [];
  return (
    <section className="redesign-rail-panel">
      <div className="redesign-section-heading">
        <span>Related markets</span>
        <strong>{related.length ? `${related.length} aligned` : "Waiting"}</strong>
        <em>score</em>
      </div>
      {related.length ? (
        <div className="redesign-related-stack">
          {related.map((market) => (
            <article key={market.marketId} className="redesign-related-row">
              <strong>{shorten(market.title, 72)}</strong>
              <div>
                <span>YES {fmtCents(market.yesPrice, 1)}</span>
                <span className={market.directionAligned ? "is-up" : "is-warn"}>
                  {market.directionAligned ? "aligned" : "diverged"}
                </span>
                <span>{fmtPct(market.movePercent, { sign: true, digits: 1 })}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="redesign-mini-copy">Related market movement appears after catalyst analysis.</p>
      )}
    </section>
  );
}

function ProbabilityBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "up" | "down";
}) {
  const pct = value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value * 100));
  return (
    <div className={`redesign-probability is-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{fmtCents(value, 1)}</strong>
      </div>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

function walletActivityFromIntel(
  intel: ReturnType<typeof useMarketIntel>["data"],
): WalletActivity[] {
  if (intel?.walletActivity?.length) return intel.walletActivity;
  return (intel?.trades ?? [])
    .filter((trade) => trade.proxyWallet && trade.notional >= 25_000)
    .map((trade, index) => ({
      id: trade.transactionHash ?? `trade-${trade.timestamp}-${index}`,
      marketId: intel?.id ?? trade.conditionId ?? "unknown",
      walletAddress: trade.proxyWallet ?? "0x0000000000000000000000000000000000000000",
      label: trade.traderName,
      outcome: trade.outcome ?? "UNKNOWN",
      side: trade.side,
      size: trade.size,
      notionalUsd: trade.notional,
      price: trade.price,
      timestamp: new Date(trade.timestamp * 1000).toISOString(),
      source: "polymarket",
    }));
}

type SignalFlowWorkspaceProps = {
  focusedId: string;
  onSelectMarket: (id: string) => void;
};

export function SignalFlowWorkspace({
  focusedId,
  onSelectMarket,
}: SignalFlowWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    result,
    workspaceMode,
    setWorkspaceMode,
    pushCommandHistory,
    runExplainWithId,
    isWatched,
  } = useTerminal();
  const activeRoute = terminalSectionFromPath(pathname);
  const laneParam = searchParams.get("lane");
  const lane: DiscoveryLane = isDiscoveryLane(laneParam) ? laneParam : activeRoute?.lane ?? "hot";
  const limit = parseDiscoveryLimitFromSearch(searchParams.get("limit"));
  const offset = parseDiscoveryOffsetFromSearch(searchParams.get("offset"));
  const query = searchParams.get("q")?.trim() ?? "";
  const tagId = parseTagIdFromSearch(searchParams.get("tag_id"));
  const hours = parseClosingHoursFromSearch(searchParams.get("hours"));
  const discoveryOpts = useMemo(
    () => ({ limit, tagId, hours, offset, query }),
    [limit, tagId, hours, offset, query],
  );
  const {
    data: discoveryPayload,
    isLoading,
    isError,
    error,
  } = useTerminalDiscoveryPayload(lane, discoveryOpts);
  const rows = discoveryPayload?.items ?? [];
  const fallbackOpts = useMemo(
    () => ({ limit: Math.min(limit, 24), tagId, hours }),
    [limit, tagId, hours],
  );
  const {
    data: fallbackRows = [],
    isLoading: fallbackLoading,
    isError: fallbackIsError,
    error: fallbackError,
  } = useTerminalDiscovery("hot", fallbackOpts);
  const useFallbackInbox = !query && !isLoading && !isError && rows.length === 0 && lane !== "hot";
  const inboxRows = useFallbackInbox ? fallbackRows : rows;
  const inboxLane: DiscoveryLane = useFallbackInbox ? "hot" : lane;
  const inboxNotice = useFallbackInbox
    ? `${LANE_LABEL[lane]} is quiet; Hot markets are shown.`
    : null;
  const activeRow =
    rows.find((row) => row.id === focusedId) ??
    fallbackRows.find((row) => row.id === focusedId);

  const {
    data: snapshot,
    isLoading: snapshotLoading,
    isError: snapshotIsError,
    error: snapshotError,
  } = useMarketSnapshot(focusedId);
  const { data: intel, isLoading: intelLoading } = useMarketIntel(focusedId);
  const [provenanceDrawer, setProvenanceDrawer] = useState<ProvenanceDrawerRequest | null>(null);

  const yes = snapshot?.midpoint ?? snapshot?.yesPrice ?? activeRow?.yesPrice ?? null;
  const no = yes != null ? 1 - yes : snapshot?.noPrice ?? null;
  const movePct = sessionMove(snapshot?.history, yes) ?? activeRow?.shortMovePct ?? null;
  const closingHrs = hoursUntil(snapshot?.endDate ?? activeRow?.endDate);
  const title =
    snapshot?.question ??
    activeRow?.question ??
    (snapshotLoading ? "Loading selected market..." : `Market #${focusedId}`);
  const catalystReady = result?.marketId === focusedId;
  const status = catalystStatus(result, focusedId);
  const sourceCount = intel?.sources.length ?? 0;
  const tradeCount = intel?.trades.length ?? 0;
  const turboMarket = useMemo(
    () => ({
      id: focusedId,
      title,
      yes,
      no,
      movePct,
      spread: snapshot?.spread ?? intel?.orderBook?.summary.spread ?? null,
      liquidity: snapshot?.liquidity ?? activeRow?.liquidityNum ?? null,
      volume24h: snapshot?.volume24hr ?? activeRow?.volume24hr ?? null,
      sourceCount,
      hasCatalyst: catalystReady,
      topCatalystTitle: catalystReady ? result.likelyCatalysts[0]?.title ?? null : null,
    }),
    [
      activeRow?.liquidityNum,
      activeRow?.volume24hr,
      catalystReady,
      focusedId,
      intel?.orderBook?.summary.spread,
      movePct,
      no,
      result,
      snapshot?.liquidity,
      snapshot?.spread,
      snapshot?.volume24hr,
      sourceCount,
      title,
      yes,
    ],
  );
  const confidenceItems = useMemo(
    () => buildEvidenceConfidence(intel?.sources ?? []),
    [intel?.sources],
  );
  const confidenceScore = confidenceItems[0]?.score ?? (catalystReady ? result.confidence : 0);
  const autopilot = useMemo(() => buildAutopilotActions(turboMarket), [turboMarket]);
  const warRoom = useMemo(
    () => buildWarRoomChecklist({
      market: turboMarket,
      sourceCount,
      tradeCount,
      hasBook: Boolean(intel?.orderBook),
    }),
    [intel?.orderBook, sourceCount, tradeCount, turboMarket],
  );
  const replayFrames = useMemo(
    () => buildMarketReplayFrames(snapshot?.history, intel?.sources ?? []),
    [intel?.sources, snapshot?.history],
  );
  const timelineItems = useMemo(
    () => buildTimelineItems({ focusedId, snapshot, intel, result }),
    [focusedId, snapshot, intel, result],
  );
  const relatedGraph = useMemo(
    () => buildRelatedMarketGraph(focusedId, catalystReady ? result.relatedMarkets : []),
    [catalystReady, focusedId, result],
  );
  const alertDraft = useMemo(
    () => buildSmartAlertDraft(turboMarket, confidenceScore),
    [confidenceScore, turboMarket],
  );
  const tapeSignals = useMemo(
    () => buildTradeTapeSignals(intel?.trades ?? []),
    [intel?.trades],
  );
  const walletActivity = useMemo(() => walletActivityFromIntel(intel), [intel]);
  const marketMoves =
    intel?.moves ??
    (snapshot?.jump
      ? [
          {
            id: `jump-${snapshot.jump.t}`,
            marketId: focusedId,
            timestamp: new Date(snapshot.jump.t * 1000).toISOString(),
            windowMinutes: Math.max(1, Math.round((snapshot.jump.windowEnd - snapshot.jump.windowStart) / 60)),
            probabilityBefore: snapshot.jump.priceBefore,
            probabilityAfter: snapshot.jump.priceAfter,
            volumeUsd: snapshot.volume24hr ?? activeRow?.volume24hr ?? 0,
            source: "polymarket",
          },
        ]
      : []);
  const alertRules = intel?.alertRules ?? [];
  const alertEvents = intel?.alertEvents ?? [];
  const dataMode = discoveryPayload?.dataMode ?? intel?.dataMode ?? snapshot?.dataMode;
  const fallbackReason = discoveryPayload?.fallbackReason ?? intel?.fallbackReason ?? snapshot?.fallbackReason;
  const journal = useMemo(
    () => buildDecisionJournal(turboMarket, status.label),
    [status.label, turboMarket],
  );
  const heatmap = useMemo(() => buildOpportunityHeatmap(inboxRows), [inboxRows]);
  const commands = useMemo(
    () => buildCommandSuggestions(focusedId, title),
    [focusedId, title],
  );

  useEffect(() => {
    if (activeRoute && activeRoute.mode !== workspaceMode) {
      setWorkspaceMode(activeRoute.mode);
    }
  }, [activeRoute, setWorkspaceMode, workspaceMode]);

  function handleCommand(command: string) {
    pushCommandHistory(command);
    const normalized = command.trim().toLowerCase();
    const openMarketMatch = normalized.match(/^open\s+market\s+#?(\d{3,})$/);
    if (openMarketMatch?.[1]) {
      onSelectMarket(openMarketMatch[1]);
      return;
    }

    if (normalized === "go sources") {
      const route = terminalRouteById("sources");
      if (route) router.push(terminalRouteHref(route, new URLSearchParams(searchParams.toString()), focusedId), { scroll: false });
      return;
    }

    if (normalized === "show movers") {
      const route = terminalRouteById("movers");
      if (route) router.push(terminalRouteHref(route, new URLSearchParams(searchParams.toString()), focusedId), { scroll: false });
      return;
    }

    if (normalized.startsWith("search ")) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("lane", "all_markets");
      next.set("q", command.trim().slice("search ".length).trim());
      next.delete("offset");
      router.push(`/terminal/markets?${next.toString()}`, { scroll: false });
      return;
    }

    const marketMatch = normalized.match(/^(?:mkt|market|why|analyze)?\s*#?(\d{3,})$/);
    if (marketMatch?.[1]) {
      const id = marketMatch[1];
      if (normalized.startsWith("why") || normalized.startsWith("analyze")) {
        void runExplainWithId(id);
      } else {
        onSelectMarket(id);
      }
      return;
    }

    const route = TERMINAL_ROUTES.find((item) => {
      const label = item.label.toLowerCase();
      return normalized === item.id || normalized === label || normalized === label.replace(/\s+/g, "-");
    });
    if (route) {
      router.push(terminalRouteHref(route, new URLSearchParams(searchParams.toString()), focusedId), { scroll: false });
      return;
    }

    if (normalized.length >= 2) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("lane", "all_markets");
      next.set("q", command.trim());
      next.delete("offset");
      router.push(`/terminal/markets?${next.toString()}`, { scroll: false });
    }
  }

  const markers: ChartMarker[] = [];
  if (snapshot?.jump) {
    markers.push({
      t: snapshot.jump.t,
      windowStart: snapshot.jump.windowStart,
      windowEnd: snapshot.jump.windowEnd,
      price: snapshot.jump.priceAfter,
      label: `${snapshot.jump.moveCents >= 0 ? "+" : ""}${snapshot.jump.moveCents.toFixed(1)}c`,
      note: `Largest step: ${fmtCents(snapshot.jump.priceBefore, 1)} to ${fmtCents(snapshot.jump.priceAfter, 1)}`,
      color: snapshot.jump.direction === "YES" ? "var(--solvol-green)" : "var(--solvol-red)",
      kind: "jump",
      direction: snapshot.jump.direction,
    });
  }
  if (catalystReady) {
    for (const [i, catalyst] of result.likelyCatalysts.slice(0, 4).entries()) {
      const t = Date.parse(catalyst.timestamp);
      if (!Number.isFinite(t)) continue;
      markers.push({
        t: Math.floor(t / 1000),
        label: i === 0 ? "top" : "src",
        color:
          catalyst.direction === "YES"
            ? "var(--solvol-green)"
            : catalyst.direction === "NO"
              ? "var(--solvol-red)"
              : "var(--solvol-amber)",
        kind: "event",
        note: catalyst.title,
      });
    }
  }

  const moveText =
    snapshot?.jump
      ? `${snapshot.jump.direction} moved ${snapshot.jump.moveCents >= 0 ? "+" : ""}${snapshot.jump.moveCents.toFixed(1)}c around ${fmtTime(snapshot.jump.t)}.`
      : activeRow?.shortMovePct != null
        ? `${fmtPct(activeRow.shortMovePct, { sign: true, digits: 1 })} short move detected in ${LANE_LABEL[inboxLane]}.`
        : "No major step has been isolated yet.";

  const modifierCopy = [
    query ? `search "${query}"` : null,
    offset > 0 ? `offset ${offset}` : null,
    tagId ? `tag ${tagId}` : null,
    limit !== DISCOVERY_DEFAULT_LIMIT ? `${limit} max` : null,
    hours !== DISCOVERY_DEFAULT_CLOSING_HOURS ? `${hours}h` : null,
  ].filter(Boolean);
  const activeWorkspace = productWorkspaceFromRoute(activeRoute);
  const orderBookSummary = intel?.orderBook?.summary ?? null;
  const inboxLoading = useFallbackInbox ? fallbackLoading : isLoading;
  const inboxError = useFallbackInbox ? fallbackIsError : isError;
  const inboxErrorValue = useFallbackInbox ? fallbackError : error;

  function marketDetailHref(): string {
    const route = terminalRouteById("market-detail");
    if (!route) return `/terminal/market/${focusedId}`;
    return terminalRouteHref(route, new URLSearchParams(searchParams.toString()), focusedId);
  }

  function browseHref(delta = 0): string {
    const next = new URLSearchParams(searchParams.toString());
    next.set("lane", "all_markets");
    next.set("limit", String(limit));
    const nextOffset = Math.max(0, offset + delta);
    if (nextOffset > 0) next.set("offset", String(nextOffset));
    else next.delete("offset");
    return `/terminal/markets?${next.toString()}`;
  }

  function clearSearchHref(): string {
    const next = new URLSearchParams(searchParams.toString());
    next.set("lane", "all_markets");
    next.delete("q");
    next.delete("offset");
    return `/terminal/markets?${next.toString()}`;
  }

  function openSourcesProvenance() {
    setProvenanceDrawer({
      kind: "all-sources",
      title: `${intel?.sources.length ?? 0} normalized sources`,
    });
  }

  function renderMarketList(limitCount: number) {
    if (inboxLoading) return <div className="redesign-empty">Loading markets...</div>;
    if (inboxError) {
      return (
        <div className="redesign-empty">
          {inboxErrorValue instanceof Error ? inboxErrorValue.message : "Discovery failed"}
        </div>
      );
    }
    if (inboxRows.length === 0) return <div className="redesign-empty">No markets in this lane yet.</div>;
    return inboxRows.slice(0, limitCount).map((row) => (
      <MarketRadarRow
        key={row.id}
        row={row}
        lane={inboxLane}
        selected={row.id === focusedId}
        watched={isWatched(row.id)}
        onSelect={() => onSelectMarket(row.id)}
      />
    ));
  }

  function renderActiveWorkspace(): ReactNode {
    if (activeWorkspace === "markets") {
      const movers = sortedByMove(inboxRows);
      const volumeLeaders = sortedByVolume(inboxRows);
      const resolutionQueue = sortedByDeadline(inboxRows);
      return (
        <section className="terminal-workspace-panel terminal-workspace--markets terminal-market-first-page">
          <div className="terminal-workspace-head">
            <div>
              <span>All Markets</span>
              <h2>Every public market, immediately scannable</h2>
            </div>
            <em>
              {inboxRows.length} loaded / {dataModeLabel(dataMode, {
                real: "live public data",
                mock: "mock fallback",
                pending: "checking data mode",
              })} / refresh {Math.round(TERMINAL_REFRESH.discovery.refetchIntervalMs / 1000)}s
            </em>
          </div>
          {dataMode === "mock" || fallbackReason ? (
            <div className="terminal-fallback-notice">
              <strong>Live unavailable, demo data shown</strong>
              <span>{fallbackReason ?? "Deterministic mock fallback keeps the terminal demoable without credentials."}</span>
            </div>
          ) : null}
          <div className="editorial-browse-strip" aria-label="Polymarket browse controls">
            <span>
              {query
                ? `Searching Polymarket for "${query}"`
                : lane === "all_markets"
                  ? `Browsing public Polymarket events ${offset + 1}-${offset + limit}`
                  : "Switch to Browse for the full public Polymarket event tape"}
            </span>
            <div>
              {offset > 0 ? (
                <Link href={browseHref(-limit)}>Previous page</Link>
              ) : (
                <span aria-disabled="true">Previous page</span>
              )}
              <Link href={browseHref(limit)}>Next page</Link>
              {query ? <Link href={clearSearchHref()}>Clear search</Link> : <Link href={browseHref(0)}>Browse all Polymarket</Link>}
              <Link href={marketDetailHref()}>Selected detail</Link>
            </div>
          </div>
          <div className="redesign-lane-strip terminal-market-lanes" aria-label="Market lanes">
            {LANES.map((item) => (
              <Link key={item} href={laneHref(item, new URLSearchParams(searchParams.toString()))} className={item === lane ? "is-active" : ""}>
                {LANE_LABEL[item]}
              </Link>
            ))}
          </div>
          <div className="terminal-workspace-grid is-markets terminal-market-first-grid">
            <TerminalScreenerTable
              rows={inboxRows}
              focusedId={focusedId}
              sourceDocuments={intel?.sources ?? []}
              onOpenProvenance={setProvenanceDrawer}
              onSelectMarket={onSelectMarket}
            />
            <EditorialMarketBriefingPanel
              status={status}
              moveText={moveText}
              sourceCount={sourceCount}
              tradeCount={tradeCount}
              dataMode={dataMode}
              fallbackReason={fallbackReason ?? (modifierCopy.length ? modifierCopy.join(" / ") : LANE_INTENT[inboxLane])}
            />
            <OpportunityHeatmapPanel cells={heatmap} />
            <EditorialDigestPanel
              title="Top movers"
              deck="largest repricing"
              rows={movers}
              focusedId={focusedId}
              lane={inboxLane}
              onSelectMarket={onSelectMarket}
            />
            <EditorialDigestPanel
              title="Trending markets"
              deck="score and source heat"
              rows={inboxRows}
              focusedId={focusedId}
              lane={inboxLane}
              onSelectMarket={onSelectMarket}
            />
            <EditorialDigestPanel
              title="Volume leaders"
              deck="institutional flow"
              rows={volumeLeaders}
              focusedId={focusedId}
              lane={inboxLane}
              onSelectMarket={onSelectMarket}
            />
            <EditorialDigestPanel
              title="Resolution queue"
              deck="latest deadlines"
              rows={resolutionQueue}
              focusedId={focusedId}
              lane={inboxLane}
              onSelectMarket={onSelectMarket}
            />
            <EditorialCategoryColumns
              rows={inboxRows}
              focusedId={focusedId}
              onSelectMarket={onSelectMarket}
            />
            <EditorialNewsFeedPanel
              sources={intel?.sources ?? []}
              news={intel?.news ?? []}
            />
            <section className="turbo-panel terminal-market-list-panel">
              <TurboPanelHeader kicker="Radar" title={`${LANE_LABEL[inboxLane]} markets`} meta={inboxNotice ?? "live"} />
              <div className="redesign-market-list">{renderMarketList(12)}</div>
            </section>
          </div>
        </section>
      );
    }

    if (activeWorkspace === "flow") {
      return (
        <section className="terminal-workspace-panel terminal-flow-workspace">
          <div className="terminal-workspace-head">
            <div>
              <span>Flow</span>
              <h2>Movement, tape, wallets, and liquidity</h2>
            </div>
            <em>{walletActivity.length} public wallet prints</em>
          </div>
          <div className="terminal-workspace-grid is-flow">
            <MovementScannerPanel moves={marketMoves} scores={intel?.scores} />
            <WhaleTrackerPanel wallets={walletActivity} dataMode={dataMode} />
            <TapeIntelligencePanel signals={tapeSignals} />
            <LiquiditySummaryPanel book={orderBookSummary} />
          </div>
        </section>
      );
    }

    if (activeWorkspace === "sources") {
      return (
        <section className="terminal-workspace-panel terminal-sources-workspace">
          <div className="terminal-workspace-head">
            <div>
              <span>Sources</span>
              <h2>Evidence library and provider confidence</h2>
            </div>
            <em>{sourceCount} normalized documents</em>
          </div>
          <div className="terminal-workspace-grid is-sources">
            <SourceLibraryPanel
              sources={intel?.sources ?? []}
              normalizedNews={intel?.normalizedNews}
              onOpenProvenance={setProvenanceDrawer}
            />
            <EvidenceConfidencePanel items={confidenceItems} />
            <DataSourcesPanel
              status={intel?.sourceStatus}
              dataMode={dataMode}
              fallbackReason={fallbackReason}
              sourceCount={sourceCount}
              newsCount={intel?.news.length ?? 0}
              sourceHealth={intel?.sourceHealth}
              onOpenProvenance={setProvenanceDrawer}
            />
          </div>
        </section>
      );
    }

    if (activeWorkspace === "alerts") {
      return (
        <section className="terminal-workspace-panel terminal-alerts-workspace">
          <div className="terminal-workspace-head">
            <div>
              <span>Alerts</span>
              <h2>Local watchlist and read-only alert rules</h2>
            </div>
            <em>{alertEvents.length} events</em>
          </div>
          <div className="terminal-workspace-grid is-alerts">
            <LocalAlertsPanel
              marketId={focusedId}
              marketTitle={title}
              draft={alertDraft}
              rules={alertRules}
              events={alertEvents}
            />
            <WatchlistBoardPanel rows={inboxRows} focusedId={focusedId} onSelectMarket={onSelectMarket} />
            <SmartAlertPanel draft={alertDraft} />
            <DecisionJournalPanel journal={journal} />
          </div>
        </section>
      );
    }

    if (activeWorkspace === "watchlist") {
      return (
        <section className="terminal-workspace-panel terminal-watchlist-workspace">
          <div className="terminal-workspace-head">
            <div>
              <span>Watchlist</span>
              <h2>Pinned markets stay one click from the full tape</h2>
            </div>
            <em>{inboxRows.filter((row) => isWatched(row.id)).length} visible pins</em>
          </div>
          <div className="terminal-workspace-grid is-watchlist">
            <WatchlistBoardPanel rows={inboxRows} focusedId={focusedId} onSelectMarket={onSelectMarket} />
            <LocalAlertsPanel
              marketId={focusedId}
              marketTitle={title}
              draft={alertDraft}
              rules={alertRules}
              events={alertEvents}
            />
            <DecisionJournalPanel journal={journal} />
          </div>
        </section>
      );
    }

    if (activeWorkspace === "status") {
      return (
        <section className="terminal-workspace-panel terminal-status-workspace">
          <div className="terminal-workspace-head">
            <div>
              <span>Status</span>
              <h2>Public API health and fallback mode</h2>
            </div>
            <em>{dataModeLabel(dataMode, { real: "live reads", mock: "demo fallback", pending: "checking" })}</em>
          </div>
          <div className="terminal-workspace-grid is-status">
            <DataSourcesPanel
              status={intel?.sourceStatus}
              dataMode={dataMode}
              fallbackReason={fallbackReason}
              sourceCount={sourceCount}
              newsCount={intel?.news.length ?? 0}
              sourceHealth={intel?.sourceHealth}
              onOpenProvenance={setProvenanceDrawer}
            />
            <PowerConsolePanel suggestions={commands} />
            <WatchlistBoardPanel rows={inboxRows} focusedId={focusedId} onSelectMarket={onSelectMarket} />
          </div>
        </section>
      );
    }

    return (
      <section className="terminal-workspace-panel terminal-market-workspace">
        <div className="terminal-workspace-head">
          <div>
            <span>Market</span>
            <h2>Decision brief for the selected market</h2>
          </div>
          <em>{status.label}</em>
        </div>
        <div className="terminal-workspace-grid is-market">
          <div className="terminal-workspace-stack">
            {snapshotIsError ? (
              <div className="redesign-error">
                {snapshotError instanceof Error ? snapshotError.message : "Market snapshot failed"}
              </div>
            ) : null}
            <MarketHeader
              focusedId={focusedId}
              row={activeRow}
              title={title}
              category={snapshot?.category}
              closingHrs={closingHrs}
              endDate={snapshot?.endDate ?? activeRow?.endDate}
              yes={yes}
              no={no}
              movePct={movePct}
              volume24h={snapshot?.volume24hr ?? activeRow?.volume24hr}
              liquidity={snapshot?.liquidity ?? activeRow?.liquidityNum}
              slug={snapshot?.slug}
              eventSlug={snapshot?.eventSlug ?? activeRow?.eventSlug}
              polymarketUrl={snapshot?.polymarketUrl ?? activeRow?.polymarketUrl}
            />
            <ChartPanel
              history={snapshot?.history}
              markers={markers}
              moveText={moveText}
              loading={snapshotLoading}
            />
            <TimelinePanel items={timelineItems} isLoading={snapshotLoading || intelLoading} />
            <SignalBreakdownPanel focusedId={focusedId} result={result} />
            <WhyMovedCandidatesPanel
              candidates={intel?.whyMovedCandidates}
              onOpenProvenance={setProvenanceDrawer}
            />
            <LiquiditySummaryPanel book={orderBookSummary} />
            <EditorialHistoricalContextPanel
              row={activeRow}
              sources={intel?.sources ?? []}
              newsCount={intel?.news.length ?? 0}
            />
          </div>
          <div className="terminal-workspace-stack">
            <WarRoomPanel checklist={warRoom} />
            <RelatedGraphPanel graph={relatedGraph} />
            <MarketReplayPanel frames={replayFrames} />
            <EditorialNewsFeedPanel
              sources={intel?.sources ?? []}
              news={intel?.news ?? []}
            />
            <EditorialActivityPanel
              trades={intel?.trades ?? []}
              events={alertEvents}
            />
            <DecisionRail
              focusedId={focusedId}
              yes={yes}
              no={no}
              intel={intel}
              autopilot={autopilot}
              alertDraft={alertDraft}
              journal={journal}
              commands={commands}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="terminal-market-screen">
      <LiveDeskTopbar
        focusedId={focusedId}
        status={status}
        searchParams={new URLSearchParams(searchParams.toString())}
        suggestions={commands}
        onCommand={handleCommand}
      />
      <LiveDeskRibbon
        movePct={movePct}
        sourceCount={sourceCount}
        marketCount={inboxRows.length}
        dataMode={dataMode}
        onOpenProvenance={openSourcesProvenance}
      />
      <nav className="terminal-section-nav" aria-label="Terminal workspaces">
        {TERMINAL_ROUTES.map((route) => (
          <Link
            key={route.id}
            href={terminalRouteHref(route, new URLSearchParams(searchParams.toString()), focusedId)}
            className={activeRoute?.id === route.id ? "is-active" : ""}
          >
            <span>{route.mode}</span>
            <strong>{route.label}</strong>
            <em>{route.meta}</em>
          </Link>
        ))}
      </nav>
      <main className="editorial-page-canvas terminal-product-main">
        {renderActiveWorkspace()}
      </main>
      <SourceProvenanceDrawer
        request={provenanceDrawer}
        focusedId={focusedId}
        sources={intel?.sources ?? []}
        normalizedNews={intel?.normalizedNews}
        candidates={intel?.whyMovedCandidates}
        sourceHealth={intel?.sourceHealth}
        onClose={() => setProvenanceDrawer(null)}
      />
    </div>
  );
}
