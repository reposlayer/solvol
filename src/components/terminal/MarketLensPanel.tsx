"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMarketSnapshot } from "@/hooks/useMarketSnapshot";
import { PanelFrame, SubLabel } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtCents, fmtHours, fmtPct, fmtUsd, moveToneClass } from "@/lib/format";

type Props = {
  marketId: string | null;
  compact?: boolean;
};

type LadderLevel = {
  price: number;
  yesDepth: number;
  noDepth: number;
  label: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / (1000 * 60 * 60);
}

function sessionMove(history: { p: number }[], fallback: number | null): number | null {
  const first = history[0]?.p ?? null;
  const last = history[history.length - 1]?.p ?? fallback;
  if (first == null || last == null || first <= 0) return null;
  return ((last - first) / first) * 100;
}

function buildLadder(mid: number | null, spread: number | null, liquidity: number | null): LadderLevel[] {
  if (mid == null) return [];
  const step = clamp(spread ?? 0.025, 0.01, 0.07);
  const baseDepth = Math.max(350, (liquidity ?? 0) / 32);
  return [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const price = clamp(mid + offset * step, 0.01, 0.99);
    const centerWeight = 1 - Math.min(Math.abs(offset), 3) * 0.18;
    const directional = offset <= 0 ? 1.16 : 0.9;
    return {
      price,
      yesDepth: baseDepth * centerWeight * directional,
      noDepth: baseDepth * centerWeight * (2 - directional),
      label: offset === 0 ? "mid" : offset > 0 ? `+${offset}` : String(offset),
    };
  });
}

function gradeLiquidity(liquidity: number | null | undefined): { label: string; tone: string } {
  if ((liquidity ?? 0) >= 250_000) return { label: "Institutional", tone: "text-[var(--terminal-up)]" };
  if ((liquidity ?? 0) >= 50_000) return { label: "Tradeable", tone: "text-[var(--terminal-cyan)]" };
  if ((liquidity ?? 0) >= 10_000) return { label: "Thin", tone: "text-[var(--terminal-amber)]" };
  return { label: "Fragile", tone: "text-[var(--terminal-down)]" };
}

function pressureLabel(
  mid: number | null,
  spread: number | null,
  movePct: number | null,
  hours: number | null,
): { label: string; tone: string; detail: string } {
  if (hours != null && hours < 12) {
    return {
      label: "Resolution Pressure",
      tone: "text-[var(--terminal-amber)]",
      detail: "near close; watch official criteria",
    };
  }
  if ((spread ?? 0) > 0.06) {
    return {
      label: "Wide Book",
      tone: "text-[var(--terminal-down)]",
      detail: "price can gap on small flow",
    };
  }
  if (movePct != null && Math.abs(movePct) >= 5) {
    return {
      label: movePct > 0 ? "YES Momentum" : "NO Momentum",
      tone: movePct > 0 ? "text-[var(--terminal-up)]" : "text-[var(--terminal-down)]",
      detail: "market is repricing this session",
    };
  }
  if (mid != null && mid >= 0.7) {
    return { label: "Consensus YES", tone: "text-[var(--terminal-up)]", detail: "crowd has compressed upside" };
  }
  if (mid != null && mid <= 0.3) {
    return { label: "Consensus NO", tone: "text-[var(--terminal-down)]", detail: "YES needs a clear catalyst" };
  }
  return { label: "Balanced", tone: "text-[var(--terminal-cyan)]", detail: "two-sided probability range" };
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--terminal-muted)]">
        {label}
      </div>
      <div className={`tnum mt-0.5 font-mono text-[13px] font-semibold ${tone ?? "text-[var(--terminal-text)]"}`}>
        {value}
      </div>
    </div>
  );
}

export function MarketLensPanel({ marketId, compact = false }: Props) {
  const { loading, result, runExplainWithId, isWatched, toggleWatchlist } = useTerminal();
  const { data, isLoading, isError, error } = useMarketSnapshot(marketId ?? "540816");

  const mid = data ? data.midpoint ?? data.yesPrice : null;
  const closeHours = hoursUntil(data?.endDate);
  const move = data ? sessionMove(data.history, mid) : null;
  const ladder = useMemo(
    () => buildLadder(mid, data?.spread ?? null, data?.liquidity ?? null),
    [mid, data?.spread, data?.liquidity],
  );
  const liquidity = gradeLiquidity(data?.liquidity);
  const pressure = pressureLabel(mid, data?.spread ?? null, move, closeHours);
  const catalystReady = result?.marketId === marketId;

  return (
    <PanelFrame
      fkey="F4"
      id="market-lens"
      title="Market Lens"
      subtitle={marketId ? `#${marketId}` : "no market selected"}
      right={
        <>
          {marketId ? (
            <button
              type="button"
              onClick={() => toggleWatchlist(marketId)}
              className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] ${
                isWatched(marketId)
                  ? "border-[var(--terminal-amber)]/60 bg-[var(--terminal-amber-soft)] text-[var(--terminal-amber)]"
                  : "border-[var(--terminal-border)] text-[var(--terminal-text-2)] hover:border-[var(--terminal-amber)]/60 hover:text-[var(--terminal-amber)]"
              }`}
            >
              ★ pin
            </button>
          ) : null}
          {data?.slug ? (
            <Link
              href={`https://polymarket.com/event/${data.slug}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] text-[var(--terminal-cyan)] hover:underline"
            >
              Open market
            </Link>
          ) : null}
        </>
      }
      scroll
    >
      {isLoading ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> loading lens…
        </div>
      ) : isError ? (
        <div className="m-3 rounded-sm border border-red-900/50 bg-red-950/20 p-3 font-mono text-[11px] text-red-300">
          {error instanceof Error ? error.message : "Lens failed"}
        </div>
      ) : data ? (
        <div className={compact ? "p-1.5" : "p-2"}>
          <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2">
            <div className="flex items-start justify-between gap-2">
              <p className={`min-w-0 font-semibold leading-snug text-[var(--terminal-text)] ${compact ? "line-clamp-2 text-[11px]" : "text-[12px]"}`}>
                {data.question}
              </p>
              <span className={`tnum shrink-0 font-mono text-[14px] font-semibold ${moveToneClass(move)}`}>
                {fmtPct(move, { sign: true, digits: 1 })}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Stat label="YES midpoint" value={fmtCents(mid, 1)} tone="text-[var(--terminal-cyan)]" />
              <Stat label="NO implied" value={fmtCents(mid == null ? null : 1 - mid, 1)} tone="text-[var(--terminal-down)]" />
              <Stat label="Spread" value={data.spread == null ? "—" : data.spread.toFixed(3)} />
              <Stat label="Closes" value={fmtHours(closeHours)} tone={closeHours != null && closeHours < 24 ? "text-[var(--terminal-amber)]" : undefined} />
            </div>
          </div>

          <SubLabel>Microstructure</SubLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Liquidity" value={liquidity.label} tone={liquidity.tone} />
            <Stat label="24h volume" value={fmtUsd(data.volume24hr)} />
            <Stat label="1w volume" value={fmtUsd(data.volume1wk)} />
            <Stat label="Data points" value={String(data.history.length)} />
          </div>

          {compact ? null : <SubLabel>Quick Ladder</SubLabel>}
          {compact ? null : (
            <>
              <div className="overflow-hidden rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)]">
                <table className="tdata w-full">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>YES px</th>
                      <th>YES depth</th>
                      <th>NO depth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ladder.map((level) => (
                      <tr key={`${level.label}-${level.price}`}>
                        <td className="text-[var(--terminal-muted)]">{level.label}</td>
                        <td className="tnum text-[var(--terminal-cyan)]">{fmtCents(level.price, 1)}</td>
                        <td className="tnum">{fmtUsd(level.yesDepth)}</td>
                        <td className="tnum">{fmtUsd(level.noDepth)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 font-mono text-[9px] text-[var(--terminal-muted)]">
                Quick estimate from midpoint, spread and liquidity. Full public CLOB depth lives in F5.
              </div>
            </>
          )}

          <SubLabel>Trade Read</SubLabel>
          <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2">
            <div className={`font-mono text-[11px] font-semibold uppercase tracking-wide ${pressure.tone}`}>
              {pressure.label}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--terminal-text-2)]">
              {pressure.detail}. Catalyst status:{" "}
              <span className={catalystReady ? "text-[var(--terminal-up)]" : "text-[var(--terminal-muted)]"}>
                {catalystReady ? "ranked" : "not ranked"}
              </span>
              .
            </p>
            <button
              type="button"
              disabled={loading || !marketId}
              onClick={() => marketId ? void runExplainWithId(marketId) : undefined}
              className="mt-2 w-full rounded-sm border border-[var(--terminal-cyan)]/50 bg-[var(--terminal-cyan-soft)] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-cyan)] hover:brightness-125 disabled:opacity-40"
            >
              {loading ? "Running catalyst…" : "Run catalyst map"}
            </button>
          </div>
        </div>
      ) : null}
    </PanelFrame>
  );
}
