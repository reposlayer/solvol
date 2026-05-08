"use client";

import Link from "next/link";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { PriceChart, type ChartMarker } from "@/components/terminal/PriceChart";
import { useMarketSnapshot } from "@/hooks/useMarketSnapshot";
import { useSaveWorkspacePatch } from "@/hooks/useResearchDesk";
import { useTerminal } from "@/components/terminal/terminal-context";
import {
  fmtCents,
  fmtDateTime,
  fmtHours,
  fmtPct,
  fmtTime,
  fmtUsd,
  moveToneClass,
} from "@/lib/format";
import { buildPolymarketMarketUrl } from "@/lib/polymarket/links";

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
    <div className="min-w-0 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--terminal-muted)]">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-[13px] tnum ${tone ?? "text-[var(--terminal-text)]"}`}>
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

export function MarketSnapshotStrip({
  marketId,
  compact = false,
}: {
  marketId: string;
  compact?: boolean;
}) {
  const { data, error, isLoading, isError } = useMarketSnapshot(marketId);
  const { result, runExplainWithId, loading, isWatched, toggleWatchlist } = useTerminal();
  const saveWorkspace = useSaveWorkspacePatch();

  const markers: ChartMarker[] = [];
  if (data?.jump) {
    const jumpTone =
      data.jump.direction === "YES" ? "var(--terminal-up)" : "var(--terminal-down)";
    markers.push({
      t: data.jump.t,
      windowStart: data.jump.windowStart,
      windowEnd: data.jump.windowEnd,
      price: data.jump.priceAfter,
      label: `${data.jump.moveCents >= 0 ? "+" : ""}${data.jump.moveCents.toFixed(1)}¢`,
      note: `Largest CLOB step: ${fmtCents(data.jump.priceBefore, 1)} → ${fmtCents(data.jump.priceAfter, 1)}`,
      color: jumpTone,
      kind: "jump",
      direction: data.jump.direction,
    });
  }
  if (result && result.marketId === marketId) {
    for (const [i, catalyst] of result.likelyCatalysts.slice(0, 3).entries()) {
      const t = Date.parse(catalyst.timestamp);
      if (!Number.isFinite(t)) continue;
      markers.push({
        t: Math.floor(t / 1000),
        label: i === 0 ? "★" : "•",
        color:
          catalyst.direction === "YES"
            ? "var(--terminal-up)"
            : catalyst.direction === "NO"
              ? "var(--terminal-down)"
              : "var(--terminal-amber)",
        kind: "event",
        note: catalyst.title,
      });
    }
  }

  if (isError && error) {
    return (
      <div className="tpanel border-[var(--terminal-border-hi)] bg-[var(--terminal-bg)] px-3 py-2 font-mono text-[11px] text-[var(--terminal-text-2)]">
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
  const catalystReady = result?.marketId === data.id;
  const polymarketHref =
    data.polymarketUrl ??
    buildPolymarketMarketUrl({
      eventSlug: data.eventSlug,
      question: data.question,
      marketSlug: data.slug,
      id: data.id,
    });

  return (
    <PanelFrame
      fkey="F2"
      title="Decision Canvas"
      subtitle={`#${data.id}`}
      className="cockpit-decision overflow-hidden"
      right={
        <>
          <Link
            href={polymarketHref}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-[var(--terminal-cyan)] hover:underline"
          >
            Polymarket ↗
          </Link>
        </>
      }
    >
      <div className={compact ? "px-3 py-2" : "px-4 py-3"}>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.34fr)]">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--terminal-muted)]">
              <span>Focus market</span>
              <span className="tnum text-[var(--terminal-cyan)]">#{data.id}</span>
              <span className={catalystReady ? "text-[var(--terminal-up)]" : "text-[var(--terminal-muted)]"}>
                {catalystReady ? "Catalyst ranked" : "Catalyst idle"}
              </span>
            </div>
            <h3 className={`font-semibold leading-tight text-[var(--terminal-text)] ${compact ? "text-[14px]" : "text-[18px] md:text-[20px]"}`}>
              {data.question}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-sm border border-[var(--terminal-cyan)]/35 bg-[var(--terminal-cyan-soft)]/45 px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--terminal-cyan)]">
                YES mid
              </div>
              <div className="tnum mt-1 font-mono text-[24px] font-semibold leading-none text-[var(--terminal-cyan)]">
                {fmtCents(yes, 1)}
              </div>
            </div>
            <div className="rounded-sm border border-[var(--terminal-down)]/35 bg-[var(--terminal-down-soft)]/45 px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--terminal-down)]">
                NO mid
              </div>
              <div className="tnum mt-1 font-mono text-[24px] font-semibold leading-none text-[var(--terminal-down)]">
                {fmtCents(no, 1)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runExplainWithId(data.id)}
            className="rounded-sm border border-[var(--terminal-cyan)]/55 bg-[var(--terminal-cyan-soft)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-cyan)] hover:brightness-125 disabled:opacity-40"
          >
            {loading ? "Analyzing" : catalystReady ? "Refresh catalyst" : "Run catalyst"}
          </button>
          <button
            type="button"
            onClick={() => toggleWatchlist(data.id)}
            className={`rounded-sm border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
              isWatched(data.id)
                ? "border-[var(--terminal-amber)]/60 bg-[var(--terminal-amber-soft)] text-[var(--terminal-amber)]"
                : "border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] text-[var(--terminal-text-2)] hover:border-[var(--terminal-amber)]/60 hover:text-[var(--terminal-amber)]"
            }`}
          >
            {isWatched(data.id) ? "Pinned" : "Pin"}
          </button>
          <Link
            href={polymarketHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-text-2)] hover:border-[var(--terminal-cyan)]/60 hover:text-[var(--terminal-cyan)]"
          >
            Open market
          </Link>
          <button
            type="button"
            disabled={saveWorkspace.isPending}
            onClick={() =>
              saveWorkspace.mutate({
                savedMarket: {
                  marketId: data.id,
                  marketTitle: data.question,
                  folder: "Inbox",
                  tags: ["research"],
                  thesis: result?.marketId === data.id ? result.explanation : null,
                },
              })
            }
            className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-text-2)] hover:border-[var(--terminal-violet)]/60 hover:text-[var(--terminal-violet)] disabled:opacity-40"
          >
            {saveWorkspace.isPending ? "Saving" : "Save research"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--terminal-border)] border-y border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] min-[560px]:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
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
          label="Jump"
          value={
            data.jump
              ? `${data.jump.moveCents >= 0 ? "+" : ""}${data.jump.moveCents.toFixed(1)}¢`
              : "—"
          }
          tone={data.jump ? moveToneClass(data.jump.movePercent) : undefined}
          sub={data.jump ? fmtTime(data.jump.t) : "largest step"}
        />
        <Stat
          label="Spread"
          value={data.spread !== null ? data.spread.toFixed(3) : "—"}
          tone="text-[var(--terminal-text-2)]"
          sub="midpoint gap"
        />
      </div>

      <div className="min-h-0 px-2 pb-2 pt-2">
        <PriceChart
          history={data.history}
          showNo
          height={compact ? 170 : 278}
          markers={markers}
        />
      </div>
    </PanelFrame>
  );
}
