"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DiscoveryLane, DiscoveryMarketRow } from "@/lib/polymarket/discovery";
import {
  parseClosingHoursFromSearch,
  parseDiscoveryLimitFromSearch,
  parseTagIdFromSearch,
} from "@/hooks/discovery-url";
import { useTerminalDiscovery } from "@/hooks/useTerminalDiscovery";
import { useTerminal } from "@/components/terminal/terminal-context";
import { fmtCents, fmtUsd, shorten } from "@/lib/format";

function laneFromSearch(raw: string | null): DiscoveryLane {
  if (
    raw === "high_volume" ||
    raw === "closing_soon" ||
    raw === "new" ||
    raw === "hot"
  ) {
    return raw;
  }
  return "hot";
}

type ItemProps = {
  rows: DiscoveryMarketRow[];
  keySuffix: string;
  onPick: (id: string) => void;
};

function TapeItems({ rows, keySuffix, onPick }: ItemProps) {
  return (
    <>
      {rows.map((r) => {
        const yes = fmtCents(r.yesPrice, 0);
        const spike = r.volumeSpikeRatio ?? 1;
        const spikeClr =
          spike >= 1.5
            ? "text-[var(--terminal-amber)]"
            : spike >= 1.2
              ? "text-[var(--terminal-up)]"
              : "text-[var(--terminal-muted)]";
        const mv = r.shortMovePct;
        const mvTxt =
          mv == null ? null : `${mv >= 0 ? "▲" : "▼"} ${Math.abs(mv).toFixed(1)}%`;
        const mvClr =
          mv == null
            ? ""
            : mv >= 0
              ? "text-[var(--terminal-up)]"
              : "text-[var(--terminal-down)]";
        return (
          <button
            type="button"
            key={`${keySuffix}-${r.id}`}
            onClick={() => onPick(r.id)}
            className="inline-flex shrink-0 items-center gap-1.5 border-r border-[var(--terminal-border)]/50 px-3 py-1 transition-colors hover:bg-[var(--terminal-panel-hi)]"
          >
            <span className="tnum text-[var(--terminal-cyan)]">{r.id}</span>
            <span className="text-[var(--terminal-text-2)]">
              {shorten(r.question, 36)}
            </span>
            <span className="text-[var(--terminal-muted)]">YES</span>
            <span className="tnum text-[var(--terminal-text)]">{yes}</span>
            {mvTxt ? <span className={`tnum font-medium ${mvClr}`}>{mvTxt}</span> : null}
            <span className="tnum text-[var(--terminal-muted)]">{fmtUsd(r.volume24hr)}</span>
            <span className={`tnum font-medium ${spikeClr}`}>{spike.toFixed(2)}×</span>
          </button>
        );
      })}
    </>
  );
}

function TapeContent({ onPick }: { onPick: (id: string) => void }) {
  const searchParams = useSearchParams();
  const lane = laneFromSearch(searchParams.get("lane"));
  const discoveryOpts = {
    limit: parseDiscoveryLimitFromSearch(searchParams.get("limit")),
    tagId: parseTagIdFromSearch(searchParams.get("tag_id")),
    hours: parseClosingHoursFromSearch(searchParams.get("hours")),
  };
  const { data: rows = [] } = useTerminalDiscovery(lane, discoveryOpts);
  const tapeRows = rows.slice(0, 18);

  return (
    <>
      <div className="flex shrink-0">
        <TapeItems rows={tapeRows} keySuffix="a" onPick={onPick} />
      </div>
      <div className="flex shrink-0" aria-hidden>
        <TapeItems rows={tapeRows} keySuffix="b" onPick={onPick} />
      </div>
    </>
  );
}

function TapeFallback() {
  return (
    <span className="px-3 font-mono text-[11px] text-[var(--terminal-muted)]">
      <span className="animate-blink">▍</span> tape…
    </span>
  );
}

export function TerminalTape() {
  const { runExplainWithId } = useTerminal();
  const [paused, setPaused] = useState(false);

  return (
    <div
      className={`flex h-9 shrink-0 items-stretch border-t border-[var(--terminal-border)] bg-[var(--terminal-panel)] font-mono text-[11px] ${
        paused ? "tape-paused" : ""
      }`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="flex shrink-0 items-center gap-1 border-r border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-2 font-semibold tracking-wide text-[var(--terminal-up)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--terminal-up)] animate-pulse-slow" />
        LIVE
      </span>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="animate-terminal-tape flex h-full w-max">
          <Suspense fallback={<TapeFallback />}>
            <TapeContent onPick={(id) => void runExplainWithId(id)} />
          </Suspense>
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2 border-l border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-2 text-[10px] uppercase tracking-wider text-[var(--terminal-muted)]">
        {paused ? "paused — click to focus" : "hover · pause"}
      </span>
    </div>
  );
}
