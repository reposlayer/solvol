"use client";

import { useQuery } from "@tanstack/react-query";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtTime, shorten } from "@/lib/format";

type FeedMove = {
  marketId: string;
  question: string | null;
  ts: number;
  yesMid: number | null;
  deltaYesMid: number | null;
  deltaVolume24h: number | null;
};

async function fetchFeed(): Promise<FeedMove[]> {
  const res = await fetch("/api/feed?limit=12");
  const json = await res.json();
  if (!res.ok) return [];
  return (json.items ?? []) as FeedMove[];
}

export function CatalystFeedPanel() {
  const { runExplainWithId, marketId: currentId } = useTerminal();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalyst-feed"],
    queryFn: fetchFeed,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return (
    <div className="shrink-0 border-b border-[var(--terminal-border)] bg-[var(--terminal-panel-2)]/40">
      <div className="flex items-center justify-between border-b border-[var(--terminal-border)]/60 px-2.5 py-1">
        <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--terminal-cyan)]">
          Catalyst feed
        </div>
        <div className="font-mono text-[9px] text-[var(--terminal-muted)]">
          {isLoading ? "loading…" : `${items.length} moves`}
        </div>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="px-2.5 py-2 font-mono text-[9.5px] leading-snug text-[var(--terminal-muted)]">
          Idle — POST{" "}
          <span className="text-[var(--terminal-cyan)]">/api/internal/snapshot</span>{" "}
          with cron secret.
        </div>
      ) : (
        <ul className="tscroll max-h-44 space-y-px overflow-y-auto px-1.5 py-1">
          {items.map((m) => {
            const dy = m.deltaYesMid;
            const tone =
              dy == null
                ? "text-[var(--terminal-muted)]"
                : dy >= 0
                  ? "text-[var(--terminal-up)]"
                  : "text-[var(--terminal-down)]";
            const isCurrent = m.marketId === currentId;
            return (
              <li key={`${m.marketId}-${m.ts}`}>
                <button
                  type="button"
                  onClick={() => void runExplainWithId(m.marketId)}
                  className={`flex w-full items-center gap-2 rounded-sm border px-1.5 py-1 text-left font-mono text-[10px] transition-colors ${
                    isCurrent
                      ? "border-[var(--terminal-cyan)]/50 bg-[var(--terminal-cyan-soft)]/40"
                      : "border-transparent hover:border-[var(--terminal-border)] hover:bg-[var(--terminal-bg-2)]"
                  }`}
                >
                  <span className="w-9 shrink-0 tnum text-[var(--terminal-muted)]">
                    {fmtTime(m.ts)}
                  </span>
                  <span className="w-12 shrink-0 truncate tnum text-[var(--terminal-cyan)]">
                    {m.marketId}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[var(--terminal-text-2)]">
                    {shorten(m.question ?? "", 40)}
                  </span>
                  <span className={`tnum ${tone} shrink-0`}>
                    {dy == null ? "—" : `${dy >= 0 ? "+" : ""}${(dy * 100).toFixed(2)}¢`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
