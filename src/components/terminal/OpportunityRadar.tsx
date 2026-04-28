"use client";

import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtCents, fmtHours, fmtPct, fmtUsd, moveToneClass, shorten } from "@/lib/format";

type Props = {
  onSelectId: (id: string) => void;
};

type RadarCard = {
  row: DiscoveryMarketRow;
  label: string;
  score: number;
  signal: string;
  tone: string;
};

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

function cardFor(row: DiscoveryMarketRow): RadarCard {
  const move = row.shortMovePct ?? 0;
  const absMove = Math.abs(move);
  const spike = row.volumeSpikeRatio ?? 1;
  const close = row.hoursToClose ?? Infinity;
  const liq = row.liquidityNum ?? 0;
  const volume = row.volume24hr ?? 0;

  const score =
    absMove * 2.8 +
    Math.max(0, spike - 1) * 18 +
    Math.log10(1 + Math.max(volume, 0)) * 2 +
    (liq >= 50_000 ? 4 : liq >= 10_000 ? 2 : 0) +
    (close <= 24 ? 8 : close <= 72 ? 4 : 0);

  if (close <= 18) {
    return {
      row,
      label: "Expiry Knife",
      score,
      signal: `${fmtHours(close)} to resolution`,
      tone: "text-[var(--terminal-down)]",
    };
  }
  if (spike >= 1.6) {
    return {
      row,
      label: "Volume Break",
      score,
      signal: `${spike.toFixed(2)}x volume`,
      tone: "text-[var(--terminal-amber)]",
    };
  }
  if (absMove >= 3.5) {
    return {
      row,
      label: move > 0 ? "YES Breakout" : "NO Breakout",
      score,
      signal: fmtPct(move, { sign: true, digits: 1 }),
      tone: moveToneClass(move),
    };
  }
  if (row.createdAt) {
    return {
      row,
      label: "Fresh Board",
      score,
      signal: `${fmtUsd(volume)} day vol`,
      tone: "text-[var(--terminal-cyan)]",
    };
  }
  return {
    row,
    label: "Flow Watch",
    score,
    signal: `${fmtUsd(volume)} tape`,
    tone: "text-[var(--terminal-text-2)]",
  };
}

function StarButton({ id }: { id: string }) {
  const { isWatched, toggleWatchlist } = useTerminal();
  const watched = isWatched(id);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggleWatchlist(id);
      }}
      className={`h-6 w-6 shrink-0 rounded-sm border font-mono text-[11px] ${
        watched
          ? "border-[var(--terminal-amber)]/60 bg-[var(--terminal-amber-soft)] text-[var(--terminal-amber)]"
          : "border-[var(--terminal-border)] text-[var(--terminal-muted)] hover:border-[var(--terminal-amber)]/60 hover:text-[var(--terminal-amber)]"
      }`}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
    >
      ★
    </button>
  );
}

export function OpportunityRadar({ onSelectId }: Props) {
  const hot = useTerminalDiscovery("hot", { limit: 45 });
  const highVolume = useTerminalDiscovery("high_volume", { limit: 45 });
  const closing = useTerminalDiscovery("closing_soon", { limit: 35, hours: 72 });
  const newest = useTerminalDiscovery("new", { limit: 25 });
  const cards = uniqueRows(hot.data ?? [], highVolume.data ?? [], closing.data ?? [], newest.data ?? [])
    .map(cardFor)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const loading = hot.isLoading || highVolume.isLoading || closing.isLoading || newest.isLoading;

  return (
    <PanelFrame
      fkey="F6"
      id="radar"
      title="Opportunity Radar"
      subtitle={loading ? "scoring tape" : `${cards.length} active setups`}
      scroll
    >
      {loading && !cards.length ? (
        <div className="px-3 py-8 font-mono text-[11px] text-[var(--terminal-muted)]">
          <span className="animate-blink">▍</span> scoring radar…
        </div>
      ) : (
        <div className="grid gap-1.5 p-2 md:grid-cols-2 2xl:grid-cols-1">
          {cards.map((card, index) => (
            <button
              type="button"
              key={`${card.label}-${card.row.id}`}
              onClick={() => onSelectId(card.row.id)}
              className="group min-w-0 rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 text-left transition-colors hover:border-[var(--terminal-cyan)]/60 hover:bg-[var(--terminal-panel-hi)]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="tnum w-5 shrink-0 font-mono text-[10px] text-[var(--terminal-muted)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={`shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide ${card.tone}`}>
                  {card.label}
                </span>
                <span className="tnum ml-auto shrink-0 font-mono text-[10px] text-[var(--terminal-muted)]">
                  {card.score.toFixed(1)}
                </span>
                <StarButton id={card.row.id} />
              </div>
              <div className="mt-1 truncate text-[11px] leading-snug text-[var(--terminal-text)]">
                {shorten(card.row.question, 100)}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[9.5px] text-[var(--terminal-muted)]">
                <span className="truncate">{card.signal}</span>
                <span className="tnum shrink-0">
                  YES {fmtCents(card.row.yesPrice, 0)} · {fmtUsd(card.row.volume24hr)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
