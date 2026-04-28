"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { PriceChart, type ChartMarker } from "@/components/terminal/PriceChart";
import { useMarketSnapshot } from "@/hooks/useMarketSnapshot";
import { useTerminal } from "@/components/terminal/terminal-context";
import {
  fmtCents,
  fmtDateTime,
  fmtHours,
  fmtPct,
  fmtUsd,
  moveToneClass,
} from "@/lib/format";

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / (1000 * 60 * 60);
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--terminal-muted)]">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-[14px] tnum ${tone ?? "text-[var(--terminal-text)]"}`}>
        {value}
      </div>
      {sub != null ? (
        <div className="mt-0.5 font-mono text-[9.5px] text-[var(--terminal-muted)] tnum">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export function MarketSnapshotStrip({ marketId }: { marketId: string }) {
  const { data, error, isLoading, isError } = useMarketSnapshot(marketId);
  const { result, runExplainWithId, loading } = useTerminal();

  const markers: ChartMarker[] = useMemo(() => {
    if (!result || result.marketId !== marketId) return [];
    return result.likelyCatalysts.slice(0, 3).map((c, i) => {
      const t = Date.parse(c.timestamp);
      if (!Number.isFinite(t)) return null;
      return {
        t: Math.floor(t / 1000),
        label: i === 0 ? "★" : "•",
        color:
          c.direction === "YES"
            ? "var(--terminal-up)"
            : c.direction === "NO"
              ? "var(--terminal-down)"
              : "var(--terminal-amber)",
      } as ChartMarker;
    }).filter((m): m is ChartMarker => m !== null);
  }, [result, marketId]);

  if (isError && error) {
    return (
      <div className="tpanel border-red-900/50 bg-red-950/20 px-3 py-2 font-mono text-[11px] text-red-200">
        {error instanceof Error ? error.message : "Error"}
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="tpanel px-3 py-3 font-mono text-[11px] text-[var(--terminal-muted)]">
        <span className="animate-blink">▍</span> Loading market…
      </div>
    );
  }

  const yes = data.midpoint ?? data.yesPrice;
  const no = yes != null ? 1 - yes : data.noPrice;
  const first = data.history[0]?.p ?? null;
  const last = data.history[data.history.length - 1]?.p ?? yes;
  const sessionMovePct = first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
  const closingHrs = hoursUntil(data.endDate);

  return (
    <PanelFrame
      fkey="F2"
      title="Market"
      subtitle={`#${data.id}`}
      right={
        <>
          {result && result.marketId === data.id ? null : (
            <button
              type="button"
              disabled={loading}
              onClick={() => void runExplainWithId(data.id)}
              className="rounded border border-[var(--terminal-cyan)]/50 bg-[var(--terminal-cyan-soft)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-cyan)] hover:brightness-125 disabled:opacity-40"
            >
              {loading ? "Analyzing…" : "Run catalyst"}
            </button>
          )}
          <Link
            href={
              data.slug
                ? `https://polymarket.com/event/${data.slug}`
                : `https://polymarket.com/market/${data.id}`
            }
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-[var(--terminal-cyan)] hover:underline"
          >
            Polymarket ↗
          </Link>
        </>
      }
    >
      <div className="px-3 py-2">
        <h3 className="text-[13px] font-semibold leading-snug text-[var(--terminal-text)]">
          {data.question}
        </h3>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--terminal-border)] border-y border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] sm:grid-cols-4 lg:grid-cols-7 lg:divide-y-0">
        <Stat
          label="YES mid"
          value={fmtCents(yes, 1)}
          tone="text-[var(--terminal-cyan)]"
          sub={data.spread !== null ? `spr ${data.spread.toFixed(3)}` : null}
        />
        <Stat
          label="NO mid"
          value={fmtCents(no, 1)}
          tone="text-[var(--terminal-down)]"
        />
        <Stat
          label="Δ session"
          value={fmtPct(sessionMovePct, { sign: true })}
          tone={moveToneClass(sessionMovePct)}
          sub={first != null ? `from ${fmtCents(first, 1)}` : null}
        />
        <Stat
          label="Vol 24h"
          value={fmtUsd(data.volume24hr)}
          sub={data.volume1wk ? `wk ${fmtUsd(data.volume1wk)}` : null}
        />
        <Stat label="Liquidity" value={fmtUsd(data.liquidity)} />
        <Stat
          label="Closes"
          value={fmtHours(closingHrs)}
          sub={data.endDate ? fmtDateTime(data.endDate) : null}
        />
        <Stat
          label="Points"
          value={data.history.length}
          sub={data.history.length >= 2 ? "CLOB series" : "sparse"}
        />
      </div>

      <div className="px-2 pb-2 pt-2">
        <PriceChart
          history={data.history}
          showNo
          height={220}
          markers={markers}
        />
      </div>
    </PanelFrame>
  );
}
