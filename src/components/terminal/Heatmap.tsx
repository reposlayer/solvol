"use client";

import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { fmtUsd, fmtPct, fmtCents, shorten } from "@/lib/format";

type Props = {
  rows: DiscoveryMarketRow[];
  onSelect: (id: string) => void;
};

function tileBg(move: number | null | undefined): string {
  if (move == null) return "rgba(108, 120, 136, 0.10)";
  const v = Math.max(-15, Math.min(15, move));
  const a = Math.min(0.85, 0.18 + Math.abs(v) / 18);
  if (v > 0) return `rgba(52, 211, 153, ${a.toFixed(2)})`;
  if (v < 0) return `rgba(248, 113, 113, ${a.toFixed(2)})`;
  return "rgba(108, 120, 136, 0.12)";
}

function tileBorder(move: number | null | undefined): string {
  if (move == null || Math.abs(move) < 0.5) return "var(--terminal-border)";
  return move > 0 ? "rgba(52, 211, 153, 0.45)" : "rgba(248, 113, 113, 0.45)";
}

/** Volume-weighted tile sizes via flex-grow, color by short-move %. */
export function Heatmap({ rows, onSelect }: Props) {
  if (!rows.length) {
    return (
      <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
        No rows.
      </div>
    );
  }
  const maxVol = Math.max(...rows.map((r) => r.volume24hr), 1);

  return (
    <div className="grid gap-1.5 p-2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
      {rows.map((r) => {
        const weight = Math.max(0.5, Math.log10(1 + r.volume24hr) / Math.log10(1 + maxVol));
        const span = weight > 0.85 ? 2 : 1;
        return (
          <button
            type="button"
            key={r.id}
            onClick={() => onSelect(r.id)}
            className="flex flex-col justify-between rounded-sm p-2 text-left transition-colors hover:brightness-125"
            style={{
              background: tileBg(r.shortMovePct),
              border: `1px solid ${tileBorder(r.shortMovePct)}`,
              gridColumn: span === 2 ? "span 2" : undefined,
              minHeight: 78,
            }}
          >
            <div className="flex items-start justify-between gap-1 font-mono text-[9.5px]">
              <span className="text-[var(--terminal-cyan)] tnum">{r.id}</span>
              <span
                className={`tnum font-semibold ${
                  r.shortMovePct == null
                    ? "text-[var(--terminal-muted)]"
                    : r.shortMovePct >= 0
                      ? "text-[var(--terminal-up)]"
                      : "text-[var(--terminal-down)]"
                }`}
              >
                {fmtPct(r.shortMovePct, { sign: true, digits: 1 })}
              </span>
            </div>
            <div className="my-1 text-[10.5px] leading-tight text-[var(--terminal-text)]">
              {shorten(r.question, 64)}
            </div>
            <div className="flex justify-between font-mono text-[9.5px] text-[var(--terminal-muted)] tnum">
              <span>YES {fmtCents(r.yesPrice, 0)}</span>
              <span>{fmtUsd(r.volume24hr)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
