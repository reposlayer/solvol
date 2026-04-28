"use client";

import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtCents, fmtPct, fmtUsd, moveToneClass, shorten } from "@/lib/format";

type Props = {
  onSelectId: (id: string) => void;
};

function rowFor(id: string, rows: DiscoveryMarketRow[]): DiscoveryMarketRow | null {
  return rows.find((row) => row.id === id) ?? null;
}

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

export function MarketComparePanel({ onSelectId }: Props) {
  const { watchlist, isWatched, toggleWatchlist } = useTerminal();
  const hot = useTerminalDiscovery("hot", { limit: 50 });
  const highVolume = useTerminalDiscovery("high_volume", { limit: 50 });
  const rows = uniqueRows(hot.data ?? [], highVolume.data ?? []);
  const selected = (watchlist.length ? watchlist.map((id) => rowFor(id, rows)).filter((row): row is DiscoveryMarketRow => row !== null) : rows.slice(0, 5))
    .slice(0, 7);

  return (
    <PanelFrame
      fkey="F12"
      title="Compare Strip"
      subtitle={watchlist.length ? "watchlist basis" : "top tape basis"}
      scroll
    >
      <table className="tdata w-full min-w-[620px]">
        <thead>
          <tr>
            <th>Pin</th>
            <th>Market</th>
            <th>YES</th>
            <th>Δ</th>
            <th>Vol</th>
            <th>Liq</th>
            <th>Spike</th>
          </tr>
        </thead>
        <tbody>
          {selected.map((row) => (
            <tr key={row.id} className="cursor-pointer" onClick={() => onSelectId(row.id)}>
              <td>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleWatchlist(row.id);
                  }}
                  className={`h-5 w-5 rounded-sm border font-mono text-[10px] ${
                    isWatched(row.id)
                      ? "border-[var(--terminal-amber)]/60 bg-[var(--terminal-amber-soft)] text-[var(--terminal-amber)]"
                      : "border-[var(--terminal-border)] text-[var(--terminal-muted)]"
                  }`}
                  aria-label={isWatched(row.id) ? "Remove from watchlist" : "Add to watchlist"}
                  title={isWatched(row.id) ? "Remove from watchlist" : "Add to watchlist"}
                >
                  ★
                </button>
              </td>
              <td className="max-w-[260px] !whitespace-normal text-[var(--terminal-text)]">
                <span className="mr-1 text-[var(--terminal-cyan)]">#{row.id}</span>
                {shorten(row.question, 68)}
              </td>
              <td className="tnum">{fmtCents(row.yesPrice, 0)}</td>
              <td className={`tnum ${moveToneClass(row.shortMovePct)}`}>
                {fmtPct(row.shortMovePct, { sign: true, digits: 1 })}
              </td>
              <td className="tnum">{fmtUsd(row.volume24hr)}</td>
              <td className="tnum text-[var(--terminal-muted)]">{fmtUsd(row.liquidityNum)}</td>
              <td className="tnum text-[var(--terminal-amber)]">
                {row.volumeSpikeRatio ? `${row.volumeSpikeRatio.toFixed(2)}x` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelFrame>
  );
}
