"use client";

import type { DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { PanelFrame } from "@/components/terminal/PanelFrame";
import { fmtPct, fmtUsd, moveToneClass } from "@/lib/format";

type Sector = {
  name: string;
  keys: string[];
  tone: string;
};

type SectorStat = Sector & {
  count: number;
  volume: number;
  avgMove: number | null;
  spike: number | null;
};

const SECTORS: Sector[] = [
  { name: "Crypto", keys: ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "coinbase", "binance"], tone: "var(--terminal-cyan)" },
  { name: "Politics", keys: ["trump", "biden", "election", "senate", "congress", "president", "minister", "poll"], tone: "var(--terminal-amber)" },
  { name: "Macro", keys: ["fed", "rate", "inflation", "cpi", "recession", "gdp", "jobs", "oil"], tone: "var(--terminal-violet)" },
  { name: "Sports", keys: ["nba", "nfl", "mlb", "nhl", "ufc", "champions", "world cup", "game"], tone: "var(--terminal-up)" },
  { name: "AI / Tech", keys: ["openai", "ai", "nvidia", "apple", "google", "tesla", "microsoft", "spacex"], tone: "var(--terminal-pink)" },
  { name: "Culture", keys: ["movie", "album", "oscar", "grammy", "tiktok", "youtube", "stream"], tone: "var(--terminal-down)" },
];

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

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function statFor(sector: Sector, rows: DiscoveryMarketRow[]): SectorStat {
  const matches = rows.filter((row) => {
    const q = row.question.toLowerCase();
    return sector.keys.some((key) => q.includes(key));
  });
  return {
    ...sector,
    count: matches.length,
    volume: matches.reduce((sum, row) => sum + row.volume24hr, 0),
    avgMove: average(matches.map((row) => row.shortMovePct ?? 0).filter((value) => value !== 0)),
    spike: average(matches.map((row) => row.volumeSpikeRatio ?? 0).filter((value) => value > 0)),
  };
}

export function SectorPulsePanel() {
  const hot = useTerminalDiscovery("hot", { limit: 70 });
  const highVolume = useTerminalDiscovery("high_volume", { limit: 70 });
  const newest = useTerminalDiscovery("new", { limit: 35 });
  const rows = uniqueRows(hot.data ?? [], highVolume.data ?? [], newest.data ?? []);
  const stats = SECTORS.map((sector) => statFor(sector, rows)).sort((a, b) => b.volume - a.volume);
  const maxVolume = Math.max(...stats.map((stat) => stat.volume), 1);

  return (
    <PanelFrame
      fkey="F7"
      title="Sector Pulse"
      subtitle={`${rows.length} market sample`}
      scroll
    >
      <div className="space-y-1.5 p-2">
        {stats.map((stat) => {
          const width = Math.max(5, (stat.volume / maxVolume) * 100);
          return (
            <div
              key={stat.name}
              className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: stat.tone }}
                />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-text-2)]">
                  {stat.name}
                </span>
                <span className="tnum ml-auto font-mono text-[10px] text-[var(--terminal-muted)]">
                  {stat.count} mkts
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-[var(--terminal-panel)]">
                <div
                  className="h-full"
                  style={{ width: `${width}%`, background: stat.tone }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[9.5px]">
                <span className="tnum text-[var(--terminal-text-2)]">{fmtUsd(stat.volume)}</span>
                <span className={`tnum ${moveToneClass(stat.avgMove)}`}>
                  {fmtPct(stat.avgMove, { sign: true, digits: 1 })}
                </span>
                <span className="tnum text-[var(--terminal-muted)]">
                  {stat.spike ? `${stat.spike.toFixed(2)}x` : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </PanelFrame>
  );
}
