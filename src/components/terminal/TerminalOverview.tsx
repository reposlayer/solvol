"use client";

import { useMemo, type ReactNode } from "react";
import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtCents, fmtHours, fmtPct, fmtUsd, moveToneClass, shorten } from "@/lib/format";

type Props = {
  onSelectId: (id: string) => void;
};

const EMPTY_ROWS: DiscoveryMarketRow[] = [];

function uniqueRows(...groups: DiscoveryMarketRow[][]): DiscoveryMarketRow[] {
  const seen = new Set<string>();
  const out: DiscoveryMarketRow[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function strongestMover(rows: DiscoveryMarketRow[]): DiscoveryMarketRow | null {
  return rows
    .filter((row) => typeof row.shortMovePct === "number")
    .sort((a, b) => Math.abs(b.shortMovePct ?? 0) - Math.abs(a.shortMovePct ?? 0))[0] ?? null;
}

function largestSpike(rows: DiscoveryMarketRow[]): DiscoveryMarketRow | null {
  return rows
    .filter((row) => typeof row.volumeSpikeRatio === "number")
    .sort((a, b) => (b.volumeSpikeRatio ?? 0) - (a.volumeSpikeRatio ?? 0))[0] ?? null;
}

function regimeLabel(rows: DiscoveryMarketRow[]): {
  label: string;
  tone: string;
  detail: string;
} {
  const absMove = avg(rows.map((row) => Math.abs(row.shortMovePct ?? 0)).filter((n) => n > 0));
  const spike = avg(rows.map((row) => row.volumeSpikeRatio ?? 0).filter((n) => n > 0));
  if ((absMove ?? 0) >= 5 || (spike ?? 0) >= 1.65) {
    return {
      label: "Event Driven",
      tone: "text-[var(--terminal-amber)]",
      detail: "moves and volume are clustering",
    };
  }
  if ((absMove ?? 0) >= 2.2 || (spike ?? 0) >= 1.25) {
    return {
      label: "Two-Way Flow",
      tone: "text-[var(--terminal-cyan)]",
      detail: "liquid tape with selective breaks",
    };
  }
  return {
    label: "Quiet Tape",
    tone: "text-[var(--terminal-text-2)]",
    detail: "scan closing and new listings",
  };
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0 border-r border-[var(--terminal-border)] px-2 py-1.5 last:border-r-0">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--terminal-muted)]">
        {label}
      </div>
      <div className={`tnum mt-0.5 truncate font-mono text-[13px] font-semibold ${tone ?? "text-[var(--terminal-text)]"}`}>
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate font-mono text-[9px] text-[var(--terminal-muted)]">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function HotRow({
  row,
  label,
  onSelectId,
}: {
  row: DiscoveryMarketRow | null;
  label: string;
  onSelectId: (id: string) => void;
}) {
  if (!row) {
    return (
      <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5 font-mono text-[10px] text-[var(--terminal-muted)]">
        {label}: waiting for feed
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectId(row.id)}
      className="min-w-0 rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1 text-left transition-colors hover:border-[var(--terminal-cyan)]/60 hover:bg-[var(--terminal-panel-hi)]"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--terminal-muted)]">
          {label}
        </span>
        <span className="tnum shrink-0 font-mono text-[10px] text-[var(--terminal-cyan)]">
          #{row.id}
        </span>
        <span className={`tnum ml-auto shrink-0 font-mono text-[10px] font-semibold ${moveToneClass(row.shortMovePct)}`}>
          {fmtPct(row.shortMovePct, { sign: true, digits: 1 })}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[10.5px] text-[var(--terminal-text-2)]">
        {shorten(row.question, 92)}
      </div>
    </button>
  );
}

export function TerminalOverview({ onSelectId }: Props) {
  const { watchlist } = useTerminal();
  const hot = useTerminalDiscovery("hot", { limit: 40 });
  const highVolume = useTerminalDiscovery("high_volume", { limit: 40 });
  const closingSoon = useTerminalDiscovery("closing_soon", { limit: 30, hours: 48 });
  const newest = useTerminalDiscovery("new", { limit: 20 });

  const hotRows = hot.data ?? EMPTY_ROWS;
  const volumeRows = highVolume.data ?? EMPTY_ROWS;
  const closingRows = closingSoon.data ?? EMPTY_ROWS;
  const newRows = newest.data ?? EMPTY_ROWS;

  const allRows = useMemo(
    () => uniqueRows(hotRows, volumeRows, closingRows, newRows),
    [hotRows, volumeRows, closingRows, newRows],
  );

  const totalVolume = volumeRows.reduce((sum, row) => sum + row.volume24hr, 0);
  const topMover = strongestMover(hotRows);
  const topSpike = largestSpike(allRows);
  const closingUnderDay = closingRows.filter((row) => (row.hoursToClose ?? Infinity) <= 24).length;
  const regime = regimeLabel(allRows);
  const isBusy = hot.isLoading || highVolume.isLoading || closingSoon.isLoading || newest.isLoading;

  return (
    <PanelFrame
      fkey="F0"
      title="Market Command"
      subtitle={isBusy ? "syncing live discovery" : `${allRows.length} live candidates`}
      className="shrink-0"
    >
      <div className="grid border-b border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Regime"
          value={regime.label}
          tone={regime.tone}
          sub={regime.detail}
        />
        <Metric
          label="Top 24h volume"
          value={fmtUsd(totalVolume)}
          sub={`${volumeRows.length || "—"} markets sampled`}
        />
        <Metric
          label="Largest move"
          value={fmtPct(topMover?.shortMovePct, { sign: true, digits: 1 })}
          tone={moveToneClass(topMover?.shortMovePct)}
          sub={topMover ? `YES ${fmtCents(topMover.yesPrice, 0)}` : "waiting"}
        />
        <Metric
          label="Volume spike"
          value={topSpike?.volumeSpikeRatio ? `${topSpike.volumeSpikeRatio.toFixed(2)}x` : "—"}
          tone={(topSpike?.volumeSpikeRatio ?? 0) >= 1.5 ? "text-[var(--terminal-amber)]" : "text-[var(--terminal-text)]"}
          sub={topSpike ? fmtUsd(topSpike.volume24hr) : "waiting"}
        />
        <Metric
          label="Closing <24h"
          value={closingUnderDay}
          tone={closingUnderDay > 0 ? "text-[var(--terminal-amber)]" : "text-[var(--terminal-muted)]"}
          sub={closingRows[0] ? `next ${fmtHours(closingRows[0].hoursToClose)}` : "none loaded"}
        />
        <Metric
          label="Watchlist"
          value={watchlist.length}
          tone={watchlist.length ? "text-[var(--terminal-amber)]" : "text-[var(--terminal-muted)]"}
          sub={watchlist.slice(0, 3).map((id) => `#${id}`).join(" · ") || "no pins"}
        />
      </div>

      <div className="hidden gap-1.5 p-1.5 lg:grid lg:grid-cols-3">
        <HotRow row={topMover} label="Fastest repricing" onSelectId={onSelectId} />
        <HotRow row={topSpike} label="Volume anomaly" onSelectId={onSelectId} />
        <HotRow row={closingRows[0] ?? null} label="Near resolution" onSelectId={onSelectId} />
      </div>
    </PanelFrame>
  );
}
