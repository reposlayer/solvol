"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { DiscoveryLane, DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import {
  DISCOVERY_DEFAULT_CLOSING_HOURS,
  DISCOVERY_DEFAULT_LIMIT,
  parseClosingHoursFromSearch,
  parseDiscoveryLimitFromSearch,
  parseTagIdFromSearch,
} from "@/hooks/discovery-url";
import { useInvalidateDiscovery, useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { Heatmap } from "@/components/terminal/Heatmap";
import { useTerminal } from "@/components/terminal/terminal-context";
import {
  fmtCents,
  fmtHours,
  fmtMult,
  fmtPct,
  fmtUsd,
  moveToneClass,
  shorten,
} from "@/lib/format";

const LANE_LABEL: Record<DiscoveryLane, string> = {
  hot: "Hot · composite",
  high_volume: "High volume",
  closing_soon: "Closing soon",
  new: "New listings",
  research_worthy: "Research worthy",
  deadline_risk: "Deadline risk",
  anomaly: "Anomaly",
  catalyst_rich: "Catalyst rich",
};

const LANE_ORDER: DiscoveryLane[] = [
  "hot",
  "research_worthy",
  "catalyst_rich",
  "anomaly",
  "deadline_risk",
  "high_volume",
  "closing_soon",
  "new",
];

function laneHref(lane: DiscoveryLane, sp: URLSearchParams): string {
  const next = new URLSearchParams(sp.toString());
  next.set("lane", lane);
  return `/terminal?${next.toString()}`;
}

type ViewMode = "table" | "heatmap";

export function DiscoveryScanner({ onSelectId }: { onSelectId: (id: string) => void }) {
  const searchParams = useSearchParams();
  const { isWatched, toggleWatchlist } = useTerminal();
  const laneParam = searchParams.get("lane");
  const lane: DiscoveryLane =
    laneParam === "high_volume" ||
    laneParam === "closing_soon" ||
    laneParam === "new" ||
    laneParam === "hot" ||
    laneParam === "research_worthy" ||
    laneParam === "deadline_risk" ||
    laneParam === "anomaly" ||
    laneParam === "catalyst_rich"
      ? laneParam
      : "hot";

  const limit = parseDiscoveryLimitFromSearch(searchParams.get("limit"));
  const tagId = parseTagIdFromSearch(searchParams.get("tag_id"));
  const hours = parseClosingHoursFromSearch(searchParams.get("hours"));
  const discoveryOpts = { limit, tagId, hours };

  const { data: rows = [], isLoading, isError, error, dataUpdatedAt } =
    useTerminalDiscovery(lane, discoveryOpts);
  const invalidate = useInvalidateDiscovery();
  const [view, setView] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const an = typeof av === "number" ? av : av == null ? -Infinity : 0;
        const bn = typeof bv === "number" ? bv : bv == null ? -Infinity : 0;
        return sortDir === "asc" ? an - bn : bn - an;
      })
    : rows;

  const breadCrumbs: string[] = [];
  if (tagId) breadCrumbs.push(`tag ${tagId}`);
  if (limit !== DISCOVERY_DEFAULT_LIMIT) breadCrumbs.push(`limit ${limit}`);
  if (hours !== DISCOVERY_DEFAULT_CLOSING_HOURS) breadCrumbs.push(`${hours}h`);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function HeaderTab({ k }: { k: DiscoveryLane }) {
    const active = lane === k;
    return (
      <Link
        href={laneHref(k, new URLSearchParams(searchParams.toString()))}
        className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
          active
            ? "border-[var(--terminal-cyan)]/60 bg-[var(--terminal-cyan-soft)] text-[var(--terminal-cyan)]"
            : "border-[var(--terminal-border)] text-[var(--terminal-muted)] hover:border-[var(--terminal-border-hi)] hover:text-[var(--terminal-text-2)]"
        }`}
      >
        {LANE_LABEL[k].split(" · ")[0]}
      </Link>
    );
  }

  const updatedTxt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <PanelFrame
      fkey="F1"
      title="Scanner"
      subtitle={`${rows.length} rows${breadCrumbs.length ? ` · ${breadCrumbs.join(" · ")}` : ""}`}
      right={
        <>
          <div className="tscroll flex max-w-full gap-1 overflow-x-auto">
            {LANE_ORDER.map((l) => (
              <HeaderTab key={l} k={l} />
            ))}
          </div>
          <span className="font-mono text-[9px] text-[var(--terminal-muted)]">
            upd {updatedTxt}
          </span>
          <div className="flex overflow-hidden rounded-sm border border-[var(--terminal-border)]">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`px-2 py-0.5 font-mono text-[10px] uppercase ${
                view === "table"
                  ? "bg-[var(--terminal-panel-hi)] text-[var(--terminal-text)]"
                  : "text-[var(--terminal-muted)] hover:text-[var(--terminal-text-2)]"
              }`}
            >
              Tab
            </button>
            <button
              type="button"
              onClick={() => setView("heatmap")}
              className={`border-l border-[var(--terminal-border)] px-2 py-0.5 font-mono text-[10px] uppercase ${
                view === "heatmap"
                  ? "bg-[var(--terminal-panel-hi)] text-[var(--terminal-text)]"
                  : "text-[var(--terminal-muted)] hover:text-[var(--terminal-text-2)]"
              }`}
            >
              Heat
            </button>
          </div>
          <button
            type="button"
            onClick={() => void invalidate(lane)}
            className="rounded-sm border border-[var(--terminal-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--terminal-muted)] hover:border-[var(--terminal-border-hi)] hover:text-[var(--terminal-text-2)]"
            title="Refresh discovery"
          >
            ↻
          </button>
        </>
      }
      scroll
    >
      {isLoading ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> Loading Gamma…
        </div>
      ) : isError ? (
        <div className="px-3 py-4 font-mono text-[11px] text-red-300">
          {error instanceof Error ? error.message : "Failed"}
        </div>
      ) : view === "heatmap" ? (
        <Heatmap rows={sorted} onSelect={onSelectId} />
      ) : (
        <div className="min-h-0">
          <div className="grid grid-cols-[24px_minmax(0,1fr)_48px_58px_58px] gap-2 border-b border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--terminal-muted)]">
            <span>Pin</span>
            <span>Market</span>
            <SortButton label="YES" k="yesPrice" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
            <SortButton label="Move" k="shortMovePct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
            <SortButton label="Vol" k="volume24hr" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
          </div>
          <div className="divide-y divide-[var(--terminal-border)]/70">
            {sorted.map((r: DiscoveryMarketRow) => {
              const watched = isWatched(r.id);
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectId(r.id)}
                  onKeyDown={(event) => activateRow(event, () => onSelectId(r.id))}
                  className="grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_48px_58px_58px] gap-2 px-2 py-1.5 text-left transition-colors hover:bg-[var(--terminal-panel-hi)] focus:bg-[var(--terminal-panel-hi)] focus:outline-none"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWatchlist(r.id);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className={`h-5 w-5 rounded-sm border font-mono text-[10px] ${
                      watched
                        ? "border-[var(--terminal-amber)]/60 bg-[var(--terminal-amber-soft)] text-[var(--terminal-amber)]"
                        : "border-[var(--terminal-border)] text-[var(--terminal-muted)] hover:border-[var(--terminal-amber)]/60 hover:text-[var(--terminal-amber)]"
                    }`}
                    aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
                    title={watched ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    *
                  </button>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="tnum shrink-0 font-mono text-[10px] text-[var(--terminal-cyan)]">
                        #{r.id}
                      </span>
                      <span className="truncate text-[11px] font-medium text-[var(--terminal-text)]" title={r.question}>
                        {shorten(r.question, 86)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex min-w-0 gap-2 font-mono text-[9px] text-[var(--terminal-muted)]">
                      <span className="tnum shrink-0">spike {fmtMult(r.volumeSpikeRatio)}</span>
                      <span className="tnum shrink-0">liq {fmtUsd(r.liquidityNum)}</span>
                      <span className="tnum shrink-0">close {fmtHours(r.hoursToClose ?? null)}</span>
                      <span className="tnum truncate text-[var(--terminal-amber)]">
                        score {r.terminalScore != null ? r.terminalScore.toFixed(1) : "-"}
                      </span>
                    </div>
                  </div>
                  <div className="tnum self-center font-mono text-[11px] text-[var(--terminal-text)]">
                    {fmtCents(r.yesPrice, 0)}
                  </div>
                  <div className={`tnum self-center font-mono text-[11px] font-semibold ${moveToneClass(r.shortMovePct)}`}>
                    {fmtPct(r.shortMovePct, { sign: true, digits: 1 })}
                  </div>
                  <div className="tnum self-center truncate font-mono text-[10px] text-[var(--terminal-text-2)]">
                    {fmtUsd(r.volume24hr)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}

type SortKey = "shortMovePct" | "volume24hr" | "volumeSpikeRatio" | "yesPrice" | "hoursToClose";

function activateRow(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function SortButton({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey | null;
  sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <button
      type="button"
      className={`select-none text-left hover:text-[var(--terminal-text-2)] ${active ? "text-[var(--terminal-text)]" : ""}`}
      onClick={() => onClick(k)}
    >
      {label}
      {active ? (sortDir === "asc" ? " ^" : " v") : ""}
    </button>
  );
}
