"use client";

import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { fmtCents, fmtPct, fmtUsd, moveToneClass } from "@/lib/format";

type Props = {
  marketId: string | null;
};

function depthTone(n: number | null | undefined): string {
  if (n == null) return "text-[var(--terminal-muted)]";
  if (n > 0.12) return "text-[var(--terminal-up)]";
  if (n < -0.12) return "text-[var(--terminal-down)]";
  return "text-[var(--terminal-text-2)]";
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--terminal-muted)]">
        {label}
      </div>
      <div className={`tnum mt-0.5 truncate font-mono text-[12px] font-semibold ${tone ?? "text-[var(--terminal-text)]"}`}>
        {value}
      </div>
    </div>
  );
}

export function MarketDepthPanel({ marketId }: Props) {
  const { data, isLoading, isError, error } = useMarketIntel(marketId);
  const book = data?.orderBook;
  const summary = book?.summary;
  const maxSize = Math.max(...(summary?.ladder.map((row) => row.size) ?? [1]), 1);

  return (
    <PanelFrame
      id="clob-book"
      fkey="F5"
      title="CLOB Book"
      subtitle={data?.yesTokenId ? `YES ${data.yesTokenId.slice(0, 7)}…` : "public"}
      right={
        summary?.timestamp ? (
          <span className="font-mono text-[9px] text-[var(--terminal-muted)] tnum">
            {summary.timestamp}
          </span>
        ) : null
      }
      scroll
    >
      {!marketId ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          Select a market.
        </div>
      ) : isLoading ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> loading book…
        </div>
      ) : isError ? (
        <div className="m-2 rounded-sm border border-red-900/50 bg-red-950/20 p-2 font-mono text-[11px] text-red-300">
          {error instanceof Error ? error.message : "Book failed"}
        </div>
      ) : !summary ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          No public orderbook snapshot.
        </div>
      ) : (
        <div className="space-y-2 p-2">
          <div className="grid grid-cols-4 gap-1.5">
            <MiniStat label="Bid" value={fmtCents(summary.bestBid, 2)} tone="text-[var(--terminal-up)]" />
            <MiniStat label="Ask" value={fmtCents(summary.bestAsk, 2)} tone="text-[var(--terminal-down)]" />
            <MiniStat label="Spread" value={summary.spread == null ? "—" : `${(summary.spread * 100).toFixed(2)}¢`} />
            <MiniStat
              label="Imbal"
              value={fmtPct(summary.depthImbalance == null ? null : summary.depthImbalance * 100, { sign: true, digits: 1 })}
              tone={depthTone(summary.depthImbalance)}
            />
          </div>

          <div className="overflow-hidden rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)]">
            <table className="tdata w-full">
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Px</th>
                  <th>Size</th>
                  <th>Depth</th>
                  <th>Δ mid</th>
                </tr>
              </thead>
              <tbody>
                {summary.ladder.map((row, idx) => {
                  const width = `${Math.max(4, (row.size / maxSize) * 100)}%`;
                  const sideTone =
                    row.side === "BID" ? "text-[var(--terminal-up)]" : "text-[var(--terminal-down)]";
                  return (
                    <tr key={`${row.side}-${row.price}-${idx}`}>
                      <td className={`relative ${sideTone}`}>
                        <span
                          className="absolute inset-y-1 left-0 rounded-r-sm opacity-15"
                          style={{
                            width,
                            background:
                              row.side === "BID"
                                ? "var(--terminal-up)"
                                : "var(--terminal-down)",
                          }}
                        />
                        <span className="relative">{row.side}</span>
                      </td>
                      <td className="tnum">{fmtCents(row.price, 2)}</td>
                      <td className="tnum">{row.size.toFixed(row.size >= 100 ? 0 : 2)}</td>
                      <td className="tnum">{fmtUsd(row.cumulativeNotional)}</td>
                      <td className={`tnum ${moveToneClass(row.distanceFromMid)}`}>
                        {row.distanceFromMid == null
                          ? "—"
                          : `${row.distanceFromMid >= 0 ? "+" : ""}${row.distanceFromMid.toFixed(2)}¢`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <MiniStat label="Bid depth" value={fmtUsd(summary.bidNotional)} />
            <MiniStat label="Ask depth" value={fmtUsd(summary.askNotional)} />
            <MiniStat label="Last" value={fmtCents(summary.lastTradePrice, 2)} />
            <MiniStat label="Tick" value={summary.tickSize == null ? "—" : `${(summary.tickSize * 100).toFixed(2)}¢`} />
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
