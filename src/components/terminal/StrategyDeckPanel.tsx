"use client";

import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { fmtCents, fmtHours, fmtPct, fmtUsd, moveToneClass, shorten } from "@/lib/format";

type Props = {
  onSelectId: (id: string) => void;
};

type Setup = {
  id: string;
  title: string;
  tag: string;
  row: DiscoveryMarketRow | null;
  text: string;
  tone: string;
};

function topBy<T extends DiscoveryMarketRow>(
  rows: T[],
  score: (row: T) => number,
): T | null {
  return [...rows].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function StrategyDeckPanel({ onSelectId }: Props) {
  const hot = useTerminalDiscovery("hot", { limit: 60 });
  const highVolume = useTerminalDiscovery("high_volume", { limit: 60 });
  const closing = useTerminalDiscovery("closing_soon", { limit: 60, hours: 96 });
  const newest = useTerminalDiscovery("new", { limit: 40 });

  const momentum = topBy(hot.data ?? [], (row) => Math.abs(row.shortMovePct ?? 0));
  const liquid = topBy(highVolume.data ?? [], (row) => row.volume24hr + row.liquidityNum * 0.15);
  const expiry = topBy(closing.data ?? [], (row) => Math.max(0, 96 - (row.hoursToClose ?? 96)) + row.volume24hr / 20_000);
  const fresh = topBy(newest.data ?? [], (row) => row.volume24hr + (row.volumeSpikeRatio ?? 1) * 5000);

  const setups: Setup[] = [
    {
      id: "momentum",
      title: "Momentum Continuation",
      tag: momentum ? fmtPct(momentum.shortMovePct, { sign: true, digits: 1 }) : "—",
      row: momentum,
      text: momentum ? `YES ${fmtCents(momentum.yesPrice, 0)} · ${fmtUsd(momentum.volume24hr)} tape` : "waiting",
      tone: moveToneClass(momentum?.shortMovePct),
    },
    {
      id: "liquidity",
      title: "Liquid Reference",
      tag: liquid ? fmtUsd(liquid.volume24hr) : "—",
      row: liquid,
      text: liquid ? `liq ${fmtUsd(liquid.liquidityNum)} · spike ${(liquid.volumeSpikeRatio ?? 1).toFixed(2)}x` : "waiting",
      tone: "text-[var(--terminal-cyan)]",
    },
    {
      id: "expiry",
      title: "Resolution Catalyst",
      tag: expiry ? fmtHours(expiry.hoursToClose) : "—",
      row: expiry,
      text: expiry ? `YES ${fmtCents(expiry.yesPrice, 0)} · ${fmtUsd(expiry.volume24hr)} vol` : "waiting",
      tone: "text-[var(--terminal-amber)]",
    },
    {
      id: "fresh",
      title: "Fresh Listing",
      tag: fresh ? fmtUsd(fresh.volume24hr) : "—",
      row: fresh,
      text: fresh ? `YES ${fmtCents(fresh.yesPrice, 0)} · spike ${(fresh.volumeSpikeRatio ?? 1).toFixed(2)}x` : "waiting",
      tone: "text-[var(--terminal-violet)]",
    },
  ];

  return (
    <PanelFrame
      fkey="F10"
      title="Strategy Deck"
      subtitle="live playbook"
      scroll
    >
      <div className="grid gap-1.5 p-2 md:grid-cols-2 2xl:grid-cols-1">
        {setups.map((setup) => (
          <button
            type="button"
            key={setup.id}
            disabled={!setup.row}
            onClick={() => setup.row ? onSelectId(setup.row.id) : undefined}
            className="min-w-0 rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 text-left transition-colors hover:border-[var(--terminal-cyan)]/60 hover:bg-[var(--terminal-panel-hi)] disabled:cursor-default disabled:opacity-50"
          >
            <div className="flex items-baseline gap-2">
              <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-text-2)]">
                {setup.title}
              </span>
              <span className={`tnum ml-auto shrink-0 font-mono text-[10px] font-semibold ${setup.tone}`}>
                {setup.tag}
              </span>
            </div>
            <div className="mt-1 truncate text-[11px] text-[var(--terminal-text)]">
              {setup.row ? shorten(setup.row.question, 92) : "No setup loaded"}
            </div>
            <div className="mt-1 font-mono text-[9.5px] text-[var(--terminal-muted)]">
              {setup.text}
            </div>
          </button>
        ))}
      </div>
    </PanelFrame>
  );
}
