"use client";

import type { Catalyst, MarketMoveExplanation } from "@/lib/domain/types";
import { useTerminal } from "@/components/terminal/terminal-context";
import { CatalystFeedPanel } from "@/components/terminal/CatalystFeedPanel";
import { ScoringBars } from "@/components/terminal/ScoringBars";
import { SubLabel } from "@/components/terminal/PanelFrame";
import { fmtCents, fmtDateTime, fmtMult, fmtPct } from "@/lib/format";

function DirectionBadge({ d }: { d: Catalyst["direction"] }) {
  const styles = {
    YES: "border-[var(--terminal-up)]/55 bg-[var(--terminal-up-soft)] text-[var(--terminal-up)]",
    NO: "border-[var(--terminal-down)]/55 bg-[var(--terminal-down-soft)] text-[var(--terminal-down)]",
    unclear:
      "border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] text-[var(--terminal-muted)]",
  } as const;
  return (
    <span
      className={`rounded-sm border px-1.5 py-[1px] font-mono text-[9px] font-semibold uppercase tracking-wide ${styles[d]}`}
    >
      {d}
    </span>
  );
}

function ConfidenceMeter({ pct, band }: { pct: number; band: "high" | "medium" | "low" }) {
  const tone =
    band === "high"
      ? "text-[var(--terminal-up)]"
      : band === "medium"
        ? "text-[var(--terminal-amber)]"
        : "text-[var(--terminal-down)]";
  const fill =
    band === "high"
      ? "var(--terminal-up)"
      : band === "medium"
        ? "var(--terminal-amber)"
        : "var(--terminal-down)";
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span className="text-[var(--terminal-muted)]">Confidence</span>
        <span className={`tnum text-[14px] font-semibold ${tone}`}>{pct}%</span>
      </div>
      <div className="mt-1 h-[6px] overflow-hidden rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-panel-2)]">
        <div className="h-full" style={{ width: `${pct}%`, background: fill }} />
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-[var(--terminal-muted)]">
        {band} band
      </div>
    </div>
  );
}

function EntityChips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((e) => (
        <span
          key={e}
          className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-1.5 py-[1px] font-mono text-[9.5px] text-[var(--terminal-text-2)]"
        >
          {e}
        </span>
      ))}
    </div>
  );
}

export function IntelligenceRail() {
  const { loading, error, result } = useTerminal();

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[var(--terminal-border)] bg-[var(--terminal-panel)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--terminal-border)] bg-[var(--terminal-panel-2)] px-2.5 py-1.5">
        <span className="fkey">F3</span>
        <span className="tpanel-label text-[var(--terminal-text-2)]">Intelligence</span>
        <span className="font-mono text-[10px] text-[var(--terminal-muted)]">· catalyst engine</span>
      </header>
      <CatalystFeedPanel />
      <div className="tscroll min-h-0 flex-1 overflow-y-auto">
        {loading && !result ? (
          <div className="flex flex-1 items-center justify-center p-6 font-mono text-[11px] text-[var(--terminal-muted)]">
            <span className="animate-blink mr-1">▍</span> running retrieval &amp; scoring…
          </div>
        ) : error && !result ? (
          <div className="m-3 rounded-sm border border-red-900/50 bg-red-950/20 p-3 font-mono text-[11px] text-red-300">
            {error}
          </div>
        ) : !result ? (
          <div className="flex flex-col gap-3 p-4">
            <p className="font-mono text-[11px] leading-relaxed text-[var(--terminal-muted)]">
              Catalyst idle. Run{" "}
              <span className="text-[var(--terminal-cyan)]">explain market &lt;id&gt;</span> in the
              command bar, click any heat tile / scanner row, or press{" "}
              <span className="text-[var(--terminal-cyan)]">Run catalyst</span> in the snapshot.
            </p>
            <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-3 font-mono text-[10px] leading-relaxed text-[var(--terminal-muted)]">
              Outputs:
              <br />· likely catalyst + confidence
              <br />· scoring breakdown bars
              <br />· direction badge
              <br />· affected entities
              <br />· source links by category
              <br />· lower-ranked candidates
            </div>
          </div>
        ) : (
          <CatalystDetail result={result} />
        )}
      </div>
    </aside>
  );
}

function CatalystDetail({ result }: { result: MarketMoveExplanation }) {
  const top = result.likelyCatalysts[0];
  const rest = result.likelyCatalysts.slice(1);

  return (
    <div className="p-3">
      <div className="mb-3 rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--terminal-muted)]">
            Move summary · #{result.marketId}
          </div>
          {top ? <DirectionBadge d={top.direction} /> : null}
        </div>
        <p className="mt-1.5 text-[12px] font-medium leading-snug text-[var(--terminal-text)]">
          {result.marketTitle}
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--terminal-text-2)]">
          {result.explanation}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2">
          <ConfidenceMeter pct={result.confidence} band={result.confidenceBand} />
        </div>
        <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 font-mono">
          <div className="text-[10px] text-[var(--terminal-muted)]">Volume vs 7d</div>
          <div
            className={`tnum text-[14px] font-semibold ${
              result.volumeChange >= 1.5
                ? "text-[var(--terminal-amber)]"
                : "text-[var(--terminal-text)]"
            }`}
          >
            {fmtMult(result.volumeChange)}
          </div>
          <div className="mt-1 text-[9.5px] text-[var(--terminal-muted)]">
            {fmtCents(result.priceBefore)} → {fmtCents(result.priceAfter)}{" "}
            <span
              className={
                result.movePercent >= 0
                  ? "text-[var(--terminal-up)]"
                  : "text-[var(--terminal-down)]"
              }
            >
              {fmtPct(result.movePercent, { sign: true })}
            </span>
          </div>
        </div>
      </div>

      {top ? (
        <section className="mb-3 rounded-sm border border-[var(--terminal-cyan)]/40 bg-[var(--terminal-cyan-soft)]/30 p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--terminal-cyan)]">
              Likely catalyst · {top.source}
            </div>
            <div className="tnum font-mono text-[10px] text-[var(--terminal-text-2)]">
              {top.confidence}%
            </div>
          </div>
          <p className="mt-1 text-[12px] font-medium text-[var(--terminal-text)]">{top.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--terminal-text-2)]">
            {top.summary}
          </p>
          <div className="mt-2 font-mono text-[9.5px] text-[var(--terminal-muted)]">
            {fmtDateTime(top.timestamp)}
            {top.sourceUrl ? (
              <>
                {" · "}
                <a
                  href={top.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--terminal-cyan)] hover:underline"
                >
                  source ↗
                </a>
              </>
            ) : null}
          </div>

          {top.affectedEntities.length ? (
            <>
              <SubLabel>Entities</SubLabel>
              <EntityChips items={top.affectedEntities} />
            </>
          ) : null}

          <SubLabel>Scoring</SubLabel>
          <ScoringBars breakdown={top.scoringBreakdown} />

          {top.evidence.length ? (
            <>
              <SubLabel>Evidence</SubLabel>
              <ul className="space-y-0.5 border-l border-[var(--terminal-border)] pl-2 font-mono text-[10px] text-[var(--terminal-text-2)]">
                {top.evidence.slice(0, 5).map((ev) => (
                  <li key={ev} className="leading-snug">
                    {ev}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : (
        <p className="mb-3 text-[11px] text-[var(--terminal-muted)]">No catalyst ranked.</p>
      )}

      <section className="mb-3">
        <SubLabel>Move signals</SubLabel>
        <ul className="space-y-1 font-mono text-[10.5px] text-[var(--terminal-text-2)]">
          <li>
            <span className="text-[var(--terminal-muted)]">Window </span>
            {fmtDateTime(result.move.windowStart)} → {fmtDateTime(result.move.windowEnd)}
          </li>
          {result.move.spreadBefore !== undefined ? (
            <li>
              <span className="text-[var(--terminal-muted)]">Spread </span>
              {result.move.spreadBefore.toFixed(3)}
              {result.move.spreadAfter !== undefined
                ? ` → ${result.move.spreadAfter.toFixed(3)}`
                : ""}
            </li>
          ) : null}
          {result.move.liquidityUsd !== undefined ? (
            <li>
              <span className="text-[var(--terminal-muted)]">Liquidity </span>$
              {result.move.liquidityUsd.toLocaleString()}
            </li>
          ) : null}
        </ul>
      </section>

      {Object.values(result.sourcesByCategory).some((a) => a.length) ? (
        <section className="mb-3">
          <SubLabel>Sources</SubLabel>
          <ul className="space-y-1.5">
            {Object.entries(result.sourcesByCategory).map(([cat, items]) =>
              items.length ? (
                <li key={cat}>
                  <div className="font-mono text-[9px] uppercase tracking-wide text-[var(--terminal-muted)]">
                    {cat} · {items.length}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {items.slice(0, 6).map((it) => (
                      <li key={it.label}>
                        {it.url ? (
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate font-mono text-[10.5px] text-[var(--terminal-cyan)] hover:underline"
                            title={it.label}
                          >
                            {it.label}
                          </a>
                        ) : (
                          <span className="block truncate font-mono text-[10.5px] text-[var(--terminal-text-2)]">
                            {it.label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      {result.relatedMarkets.length ? (
        <section className="mb-3">
          <SubLabel>Related markets · {result.relatedMarkets.length}</SubLabel>
          <ul className="space-y-1">
            {result.relatedMarkets.slice(0, 6).map((rm) => (
              <li
                key={rm.marketId}
                className="flex items-center justify-between rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1 font-mono text-[10px]"
              >
                <span className="truncate text-[var(--terminal-text-2)]" title={rm.title}>
                  {rm.title}
                </span>
                <span className="ml-2 flex shrink-0 gap-2 tnum">
                  <span className="text-[var(--terminal-cyan)]">{fmtCents(rm.yesPrice, 0)}</span>
                  <span
                    className={
                      rm.movePercent >= 0
                        ? "text-[var(--terminal-up)]"
                        : "text-[var(--terminal-down)]"
                    }
                  >
                    {fmtPct(rm.movePercent, { sign: true, digits: 1 })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="mb-3">
          <SubLabel>Other candidates</SubLabel>
          <ul className="space-y-1">
            {rest.map((c, idx) => (
              <li
                key={`${c.source}-${idx}`}
                className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5"
              >
                <div className="flex items-baseline justify-between gap-2 font-mono">
                  <span className="truncate text-[10.5px] text-[var(--terminal-text-2)]">
                    {c.title}
                  </span>
                  <span className="tnum text-[10px] text-[var(--terminal-muted)]">
                    {c.confidence}%
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase text-[var(--terminal-muted)]">
                  <span>{c.source}</span>
                  <DirectionBadge d={c.direction} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.possibleCausesWhenWeak.length > 0 ? (
        <section className="mb-3 rounded-sm border border-amber-700/50 bg-[var(--terminal-amber-soft)]/40 p-2.5">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-wide text-[var(--terminal-amber)]">
            Weak signal · alternatives
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-mono text-[10px] text-[var(--terminal-text-2)]">
            {result.possibleCausesWhenWeak.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="mt-3 rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2">
        <summary className="cursor-pointer font-mono text-[10px] text-[var(--terminal-muted)]">
          Raw JSON
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto text-[9px] text-[var(--terminal-muted)]">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}
