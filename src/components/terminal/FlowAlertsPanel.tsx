"use client";

import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { fmtCents, fmtHours, fmtPct, fmtUsd, moveToneClass, shorten } from "@/lib/format";

type Props = {
  onSelectId: (id: string) => void;
};

type FlowAlert = {
  row: DiscoveryMarketRow;
  kind: "MOVE" | "SPIKE" | "CLOSE" | "LIQ";
  score: number;
  detail: string;
};

function alertFor(row: DiscoveryMarketRow): FlowAlert {
  const move = Math.abs(row.shortMovePct ?? 0);
  const spike = row.volumeSpikeRatio ?? 1;
  const close = row.hoursToClose ?? Infinity;
  const liquidity = row.liquidityNum ?? 0;

  const moveScore = move * 2.2;
  const spikeScore = Math.max(0, spike - 1) * 12;
  const closeScore = Number.isFinite(close) ? Math.max(0, 24 - close) * 0.55 : 0;
  const liqScore = liquidity >= 100_000 ? 5 : liquidity >= 25_000 ? 2 : 0;
  const score = moveScore + spikeScore + closeScore + liqScore;

  if (close <= 24 && closeScore >= moveScore && closeScore >= spikeScore) {
    return {
      row,
      kind: "CLOSE",
      score,
      detail: `resolution in ${fmtHours(close)}`,
    };
  }
  if (spike >= 1.4 && spikeScore >= moveScore) {
    return {
      row,
      kind: "SPIKE",
      score,
      detail: `${spike.toFixed(2)}x 24h volume spike`,
    };
  }
  if (move >= 2) {
    return {
      row,
      kind: "MOVE",
      score,
      detail: `${fmtPct(row.shortMovePct, { sign: true, digits: 1 })} repricing`,
    };
  }
  return {
    row,
    kind: "LIQ",
    score,
    detail: `${fmtUsd(row.volume24hr)} traded today`,
  };
}

function mergeAlerts(...groups: DiscoveryMarketRow[][]): FlowAlert[] {
  const byId = new Map<string, DiscoveryMarketRow>();
  for (const group of groups) {
    for (const row of group) {
      const prev = byId.get(row.id);
      if (!prev || (row.terminalScore ?? 0) > (prev.terminalScore ?? 0)) {
        byId.set(row.id, row);
      }
    }
  }
  return Array.from(byId.values())
    .map(alertFor)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function kindClass(kind: FlowAlert["kind"]): string {
  if (kind === "MOVE") return "border-[var(--terminal-cyan)]/50 text-[var(--terminal-cyan)]";
  if (kind === "SPIKE") return "border-[var(--terminal-amber)]/50 text-[var(--terminal-amber)]";
  if (kind === "CLOSE") return "border-[var(--terminal-down)]/50 text-[var(--terminal-down)]";
  return "border-[var(--terminal-border-hi)] text-[var(--terminal-text-2)]";
}

export function FlowAlertsPanel({ onSelectId }: Props) {
  const hot = useTerminalDiscovery("hot", { limit: 50 });
  const highVolume = useTerminalDiscovery("high_volume", { limit: 50 });
  const closing = useTerminalDiscovery("closing_soon", { limit: 30, hours: 48 });
  const alerts = mergeAlerts(hot.data ?? [], highVolume.data ?? [], closing.data ?? []);
  const loading = hot.isLoading || highVolume.isLoading || closing.isLoading;

  return (
    <PanelFrame
      fkey="F5"
      id="flow"
      title="Flow Alerts"
      subtitle={loading ? "watching tape" : `${alerts.length} derived alerts`}
      scroll
    >
      {loading && !alerts.length ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> building alerts…
        </div>
      ) : (
        <div className="divide-y divide-[var(--terminal-border)]">
          {alerts.map((alert) => (
            <button
              type="button"
              key={`${alert.kind}-${alert.row.id}`}
              onClick={() => onSelectId(alert.row.id)}
              className="block w-full px-2.5 py-2 text-left transition-colors hover:bg-[var(--terminal-panel-hi)]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`rounded-sm border px-1.5 py-[1px] font-mono text-[9px] font-semibold ${kindClass(alert.kind)}`}>
                  {alert.kind}
                </span>
                <span className="tnum shrink-0 font-mono text-[10px] text-[var(--terminal-cyan)]">
                  #{alert.row.id}
                </span>
                <span className={`tnum ml-auto shrink-0 font-mono text-[10px] font-semibold ${moveToneClass(alert.row.shortMovePct)}`}>
                  {fmtPct(alert.row.shortMovePct, { sign: true, digits: 1 })}
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-[var(--terminal-text)]">
                {shorten(alert.row.question, 86)}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[9.5px] text-[var(--terminal-muted)]">
                <span className="truncate">{alert.detail}</span>
                <span className="tnum shrink-0">
                  YES {fmtCents(alert.row.yesPrice, 0)} · {fmtUsd(alert.row.volume24hr)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
