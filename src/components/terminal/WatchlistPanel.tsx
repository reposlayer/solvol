"use client";

import { useMarketSnapshot } from "@/hooks/useMarketSnapshot";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtCents, fmtPct, fmtUsd, moveToneClass, shorten } from "@/lib/format";

type Props = {
  onSelectId: (id: string) => void;
};

function WatchRow({ id, onSelectId }: { id: string; onSelectId: (id: string) => void }) {
  const { removeFromWatchlist, runExplainWithId } = useTerminal();
  const { data, isLoading, isError } = useMarketSnapshot(id);
  const first = data?.history[0]?.p ?? null;
  const last = data?.history[data.history.length - 1]?.p ?? data?.midpoint ?? data?.yesPrice ?? null;
  const move = first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;

  return (
    <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onSelectId(id)}
          className="tnum shrink-0 font-mono text-[10px] text-[var(--terminal-cyan)] hover:underline"
        >
          #{id}
        </button>
        <span className={`tnum ml-auto shrink-0 font-mono text-[10px] font-semibold ${moveToneClass(move)}`}>
          {isLoading ? "…" : fmtPct(move, { sign: true, digits: 1 })}
        </span>
        <button
          type="button"
          onClick={() => removeFromWatchlist(id)}
          className="h-5 w-5 shrink-0 rounded-sm border border-[var(--terminal-border)] font-mono text-[11px] text-[var(--terminal-muted)] hover:border-[var(--terminal-down)]/60 hover:text-[var(--terminal-down)]"
          aria-label="Remove from watchlist"
          title="Remove from watchlist"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        onClick={() => onSelectId(id)}
        className="mt-1 block w-full truncate text-left text-[11px] leading-snug text-[var(--terminal-text)]"
      >
        {isError ? "Market unavailable" : data ? shorten(data.question, 90) : "Loading market…"}
      </button>
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[9.5px] text-[var(--terminal-muted)]">
        <span className="tnum">YES {fmtCents(data?.midpoint ?? data?.yesPrice, 0)}</span>
        <span className="tnum">{fmtUsd(data?.volume24hr)} vol</span>
        <button
          type="button"
          onClick={() => void runExplainWithId(id)}
          className="rounded-sm border border-[var(--terminal-border)] px-1.5 py-[1px] text-[9px] uppercase tracking-wide text-[var(--terminal-text-2)] hover:border-[var(--terminal-cyan)]/60 hover:text-[var(--terminal-cyan)]"
        >
          why
        </button>
      </div>
    </div>
  );
}

export function WatchlistPanel({ onSelectId }: Props) {
  const { marketId, watchlist, addToWatchlist, clearWatchlist } = useTerminal();
  return (
    <PanelFrame
      fkey="F9"
      id="watchlist"
      title="Watchlist"
      subtitle={`${watchlist.length}/24 pinned`}
      right={
        <>
          <button
            type="button"
            onClick={() => addToWatchlist(marketId)}
            className="rounded-sm border border-[var(--terminal-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--terminal-text-2)] hover:border-[var(--terminal-amber)]/60 hover:text-[var(--terminal-amber)]"
          >
            + current
          </button>
          {watchlist.length ? (
            <button
              type="button"
              onClick={clearWatchlist}
              className="rounded-sm border border-[var(--terminal-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--terminal-muted)] hover:border-[var(--terminal-down)]/60 hover:text-[var(--terminal-down)]"
            >
              clear
            </button>
          ) : null}
        </>
      }
      scroll
    >
      {watchlist.length ? (
        <div className="grid gap-1.5 p-2">
          {watchlist.slice(0, 10).map((id) => (
            <WatchRow key={id} id={id} onSelectId={onSelectId} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> no pins
        </div>
      )}
    </PanelFrame>
  );
}
