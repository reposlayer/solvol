"use client";

import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { fmtDateTime, shorten } from "@/lib/format";

type Props = {
  marketId: string | null;
};

function ageLabel(minutes: number | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

function scoreTone(score: number | undefined): string {
  if ((score ?? 0) >= 5) return "text-[var(--terminal-up)]";
  if ((score ?? 0) >= 2) return "text-[var(--terminal-cyan)]";
  return "text-[var(--terminal-muted)]";
}

export function NewsPulsePanel({ marketId }: Props) {
  const { data, isLoading, isError, error } = useMarketIntel(marketId);
  const news = data?.news ?? [];
  const terms = data?.newsTerms ?? [];

  return (
    <PanelFrame
      id="news-pulse"
      fkey="F7"
      title="News Pulse"
      subtitle={data?.category ? `${data.category} · CryptoPanic mode` : "CryptoPanic mode"}
      right={
        <span className="font-mono text-[9px] text-[var(--terminal-muted)] tnum">
          {news.length} headlines
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
          <span className="animate-blink">▍</span> loading headlines…
        </div>
      ) : isError ? (
        <div className="m-2 rounded-sm border border-red-900/50 bg-red-950/20 p-2 font-mono text-[11px] text-red-300">
          {error instanceof Error ? error.message : "News failed"}
        </div>
      ) : (
        <div className="space-y-2 p-2">
          <div className="flex min-h-7 flex-wrap items-center gap-1 overflow-hidden">
            {terms.slice(0, 10).map((term) => (
              <span
                key={term}
                className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--terminal-text-2)]"
              >
                {term}
              </span>
            ))}
          </div>

          {news.length ? (
            <div className="space-y-1">
              {news.slice(0, 16).map((item) => (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 hover:border-[var(--terminal-cyan)]/50 hover:bg-[var(--terminal-panel-hi)]"
                  title={item.publishedAt ? fmtDateTime(item.publishedAt) : undefined}
                >
                  <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide">
                    <span className="text-[var(--terminal-cyan)]">{item.feedLabel}</span>
                    <span className="text-[var(--terminal-muted)]">{item.category ?? "news"}</span>
                    <span className="tnum ml-auto text-[var(--terminal-muted)]">
                      {ageLabel(item.ageMinutes)}
                    </span>
                    <span className={`tnum ${scoreTone(item.relevanceScore)}`}>
                      R{item.relevanceScore ?? 0}
                    </span>
                  </div>
                  <div className="mt-1 text-[11.5px] font-semibold leading-snug text-[var(--terminal-text)]">
                    {shorten(item.title, 112)}
                  </div>
                  {item.matchedTerms?.length ? (
                    <div className="mt-1 truncate font-mono text-[9px] text-[var(--terminal-muted)]">
                      hit: {item.matchedTerms.slice(0, 6).join(" · ")}
                    </div>
                  ) : null}
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-3 font-mono text-[10px] text-[var(--terminal-muted)]">
              No matched headlines in current RSS sweep.
            </div>
          )}
        </div>
      )}
    </PanelFrame>
  );
}
