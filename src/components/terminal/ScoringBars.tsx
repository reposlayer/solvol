"use client";

import type { CatalystScoringBreakdown } from "@/lib/domain/types";

const ROWS: { key: keyof CatalystScoringBreakdown; label: string }[] = [
  { key: "temporalProximity", label: "Temporal" },
  { key: "sourceReliability", label: "Source" },
  { key: "volumeSupport", label: "Volume" },
  { key: "crossMarketSupport", label: "Cross-mkt" },
  { key: "liquidityPenalty", label: "Liquidity" },
];

function colorFor(key: keyof CatalystScoringBreakdown, v: number): string {
  if (key === "liquidityPenalty") {
    return v > 0.5 ? "var(--terminal-down)" : v > 0.2 ? "var(--terminal-amber)" : "var(--terminal-up)";
  }
  return v > 0.66 ? "var(--terminal-up)" : v > 0.33 ? "var(--terminal-amber)" : "var(--terminal-down)";
}

export function ScoringBars({ breakdown }: { breakdown: CatalystScoringBreakdown }) {
  return (
    <div className="space-y-1">
      {ROWS.map((r) => {
        const raw = breakdown[r.key];
        if (raw === undefined) return null;
        const v = Math.max(0, Math.min(1, raw));
        const pct = Math.round(v * 100);
        return (
          <div key={r.key} className="flex items-center gap-2 font-mono text-[10px]">
            <span className="w-[68px] shrink-0 text-[var(--terminal-muted)]">{r.label}</span>
            <div className="relative h-[6px] flex-1 overflow-hidden rounded-sm bg-[var(--terminal-panel-2)] border border-[var(--terminal-border)]">
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${pct}%`, background: colorFor(r.key, v) }}
              />
            </div>
            <span className="w-8 shrink-0 text-right tnum text-[var(--terminal-text-2)]">
              {pct}
            </span>
          </div>
        );
      })}
    </div>
  );
}
