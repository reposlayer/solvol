"use client";

import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { fmtCents, fmtTime, fmtUsd, shorten } from "@/lib/format";

type Props = {
  marketId: string | null;
};

function walletShort(wallet: string | null): string {
  if (!wallet) return "anon";
  return `${wallet.slice(0, 5)}…${wallet.slice(-4)}`;
}

export function TradeTapePanel({ marketId }: Props) {
  const { data, isLoading, isError, error } = useMarketIntel(marketId);
  const trades = data?.trades ?? [];
  const buyNotional = trades
    .filter((trade) => trade.side === "BUY")
    .reduce((sum, trade) => sum + trade.notional, 0);
  const sellNotional = trades
    .filter((trade) => trade.side === "SELL")
    .reduce((sum, trade) => sum + trade.notional, 0);
  const pressureDen = buyNotional + sellNotional;
  const pressure = pressureDen > 0 ? (buyNotional - sellNotional) / pressureDen : null;

  return (
    <PanelFrame
      id="trade-tape"
      fkey="F6"
      title="Trade Tape"
      subtitle={data?.conditionId ? `${data.conditionId.slice(0, 8)}…` : "Data API"}
      right={
        <span className="font-mono text-[9px] text-[var(--terminal-muted)] tnum">
          {trades.length} prints
        </span>
      }
      scroll
    >
      {!marketId ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          Select a market.
        </div>
      ) : isLoading ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> loading tape…
        </div>
      ) : isError ? (
        <div className="m-2 rounded-sm border border-red-900/50 bg-red-950/20 p-2 font-mono text-[11px] text-red-300">
          {error instanceof Error ? error.message : "Tape failed"}
        </div>
      ) : (
        <div className="space-y-2 p-2">
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1">
              <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--terminal-muted)]">
                Buy flow
              </div>
              <div className="tnum mt-0.5 font-mono text-[12px] font-semibold text-[var(--terminal-up)]">
                {fmtUsd(buyNotional)}
              </div>
            </div>
            <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1">
              <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--terminal-muted)]">
                Sell flow
              </div>
              <div className="tnum mt-0.5 font-mono text-[12px] font-semibold text-[var(--terminal-down)]">
                {fmtUsd(sellNotional)}
              </div>
            </div>
            <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1">
              <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--terminal-muted)]">
                Pressure
              </div>
              <div
                className={`tnum mt-0.5 font-mono text-[12px] font-semibold ${
                  pressure == null
                    ? "text-[var(--terminal-muted)]"
                    : pressure >= 0
                      ? "text-[var(--terminal-up)]"
                      : "text-[var(--terminal-down)]"
                }`}
              >
                {pressure == null ? "—" : `${pressure >= 0 ? "+" : ""}${(pressure * 100).toFixed(0)}%`}
              </div>
            </div>
          </div>

          {trades.length ? (
            <div className="overflow-hidden rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)]">
              <table className="tdata w-full">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Side</th>
                    <th>Out</th>
                    <th>Px</th>
                    <th>Size</th>
                    <th>Trader</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 18).map((trade, idx) => {
                    const sideTone =
                      trade.side === "BUY" ? "text-[var(--terminal-up)]" : "text-[var(--terminal-down)]";
                    return (
                      <tr key={`${trade.transactionHash ?? "tx"}-${trade.timestamp}-${idx}`}>
                        <td className="tnum text-[var(--terminal-muted)]">{fmtTime(trade.timestamp)}</td>
                        <td className={`font-semibold ${sideTone}`}>{trade.side}</td>
                        <td className="max-w-16 truncate">{trade.outcome ?? "—"}</td>
                        <td className="tnum">{fmtCents(trade.price, 2)}</td>
                        <td className="tnum">{trade.size.toFixed(trade.size >= 100 ? 0 : 2)}</td>
                        <td className="max-w-24 truncate text-[var(--terminal-muted)]">
                          {shorten(trade.traderName ?? walletShort(trade.proxyWallet), 18)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-3 font-mono text-[10px] text-[var(--terminal-muted)]">
              No recent public prints for this condition id.
            </div>
          )}
        </div>
      )}
    </PanelFrame>
  );
}
