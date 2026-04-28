"use client";

import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtCents, fmtHours, fmtUsd, shorten } from "@/lib/format";

type Props = {
  onSelectId: (id: string) => void;
};

function urgency(row: DiscoveryMarketRow): number {
  const close = row.hoursToClose ?? 999;
  const liq = row.liquidityNum ?? 0;
  const vol = row.volume24hr ?? 0;
  return Math.max(0, 72 - close) + Math.log10(1 + vol) * 2 + (liq >= 25_000 ? 4 : 0);
}

function toneFor(hours: number | null | undefined): string {
  if (hours == null) return "var(--terminal-muted)";
  if (hours <= 6) return "var(--terminal-down)";
  if (hours <= 24) return "var(--terminal-amber)";
  return "var(--terminal-cyan)";
}

export function ResolutionQueuePanel({ onSelectId }: Props) {
  const { isWatched, toggleWatchlist } = useTerminal();
  const closing = useTerminalDiscovery("closing_soon", { limit: 60, hours: 96 });
  const rows = [...(closing.data ?? [])]
    .sort((a, b) => urgency(b) - urgency(a))
    .slice(0, 14);
  const maxUrgency = Math.max(...rows.map(urgency), 1);

  return (
    <PanelFrame
      fkey="F8"
      id="resolution"
      title="Resolution Queue"
      subtitle={closing.isLoading ? "loading expiries" : `${rows.length} live deadlines`}
      scroll
    >
      {closing.isLoading && !rows.length ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> loading queue…
        </div>
      ) : (
        <div className="divide-y divide-[var(--terminal-border)]">
          {rows.map((row) => {
            const color = toneFor(row.hoursToClose);
            const width = Math.max(4, (urgency(row) / maxUrgency) * 100);
            return (
              <button
                type="button"
                key={row.id}
                onClick={() => onSelectId(row.id)}
                className="block w-full px-2.5 py-2 text-left transition-colors hover:bg-[var(--terminal-panel-hi)]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="tnum shrink-0 font-mono text-[10px] text-[var(--terminal-cyan)]">
                    #{row.id}
                  </span>
                  <span className="tnum ml-auto shrink-0 font-mono text-[10px]" style={{ color }}>
                    {fmtHours(row.hoursToClose)}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleWatchlist(row.id);
                    }}
                    className={`h-5 w-5 shrink-0 rounded-sm border font-mono text-[10px] ${
                      isWatched(row.id)
                        ? "border-[var(--terminal-amber)]/60 bg-[var(--terminal-amber-soft)] text-[var(--terminal-amber)]"
                        : "border-[var(--terminal-border)] text-[var(--terminal-muted)]"
                    }`}
                    aria-label={isWatched(row.id) ? "Remove from watchlist" : "Add to watchlist"}
                    title={isWatched(row.id) ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    ★
                  </button>
                </div>
                <div className="mt-1 truncate text-[11px] text-[var(--terminal-text)]">
                  {shorten(row.question, 92)}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-sm bg-[var(--terminal-bg)]">
                  <div className="h-full" style={{ width: `${width}%`, background: color }} />
                </div>
                <div className="mt-1 flex justify-between gap-2 font-mono text-[9.5px] text-[var(--terminal-muted)]">
                  <span className="tnum">YES {fmtCents(row.yesPrice, 0)}</span>
                  <span className="tnum">{fmtUsd(row.volume24hr)} vol</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </PanelFrame>
  );
}
