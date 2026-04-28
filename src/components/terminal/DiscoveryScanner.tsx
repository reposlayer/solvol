"use client";

import Link from "next/link";
import { useState } from "react";
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
          <div className="flex gap-1">
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
        <table className="tdata w-full min-w-[680px]">
          <thead>
            <tr>
              <th>Pin</th>
              <th>ID</th>
              <th className="!text-left">Market</th>
              <SortHead label="YES" k="yesPrice" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHead label="ΔYES" k="shortMovePct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHead label="Vol 24h" k="volume24hr" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHead label="Spike" k="volumeSpikeRatio" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th>Liq</th>
              <SortHead label="Close" k="hoursToClose" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: DiscoveryMarketRow) => (
              <tr
                key={r.id}
                className="cursor-pointer"
                onClick={() => onSelectId(r.id)}
              >
                <td>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWatchlist(r.id);
                    }}
                    className={`h-5 w-5 rounded-sm border font-mono text-[10px] ${
                      isWatched(r.id)
                        ? "border-[var(--terminal-amber)]/60 bg-[var(--terminal-amber-soft)] text-[var(--terminal-amber)]"
                        : "border-[var(--terminal-border)] text-[var(--terminal-muted)] hover:border-[var(--terminal-amber)]/60 hover:text-[var(--terminal-amber)]"
                    }`}
                    aria-label={isWatched(r.id) ? "Remove from watchlist" : "Add to watchlist"}
                    title={isWatched(r.id) ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    ★
                  </button>
                </td>
                <td className="text-[var(--terminal-cyan)] tnum">
                  <Link
                    href={`/market/${r.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.id}
                  </Link>
                </td>
                <td className="!whitespace-normal max-w-[320px] text-[var(--terminal-text)]">
                  <span title={r.question}>{shorten(r.question, 70)}</span>
                </td>
                <td className="tnum">{fmtCents(r.yesPrice, 1)}</td>
                <td className={`tnum font-medium ${moveToneClass(r.shortMovePct)}`}>
                  {fmtPct(r.shortMovePct, { sign: true, digits: 1 })}
                </td>
                <td className="tnum text-[var(--terminal-text-2)]">{fmtUsd(r.volume24hr)}</td>
                <td
                  className={`tnum ${
                    r.volumeSpikeRatio != null && r.volumeSpikeRatio >= 1.5
                      ? "text-[var(--terminal-amber)]"
                      : r.volumeSpikeRatio != null && r.volumeSpikeRatio >= 1.2
                        ? "text-[var(--terminal-up)]"
                        : "text-[var(--terminal-muted)]"
                  }`}
                >
                  {fmtMult(r.volumeSpikeRatio)}
                </td>
                <td className="tnum text-[var(--terminal-muted)]">
                  {fmtUsd(r.liquidityNum)}
                </td>
                <td className="tnum text-[var(--terminal-text-2)]">
                  {fmtHours(r.hoursToClose ?? null)}
                </td>
                <td className="tnum text-[var(--terminal-amber)]">
                  {r.terminalScore != null ? r.terminalScore.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PanelFrame>
  );
}

type SortKey = "shortMovePct" | "volume24hr" | "volumeSpikeRatio" | "yesPrice" | "hoursToClose";

function SortHead({
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
    <th
      className="cursor-pointer select-none hover:text-[var(--terminal-text-2)]"
      onClick={() => onClick(k)}
    >
      <span className={active ? "text-[var(--terminal-text)]" : ""}>
        {label}
        {active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </span>
    </th>
  );
}
