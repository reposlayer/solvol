"use client";

import { useMemo } from "react";
import { PanelFrame, SubLabel } from "@/components/terminal/PanelFrame";
import { useTerminal } from "@/components/terminal/terminal-context";
import {
  useCreateResearchAlert,
  useCreateResearchReport,
  useResearchAlerts,
  useResearchReports,
  useResearchSession,
  useResearchWorkspace,
  useSaveWorkspacePatch,
  useSourceLedger,
} from "@/hooks/useResearchDesk";

type Props = {
  marketId: string | null;
};

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--terminal-muted)]">
        {label}
      </div>
      <div className="tnum mt-0.5 font-mono text-[13px] font-semibold text-[var(--terminal-text)]">
        {value}
      </div>
    </div>
  );
}

export function ResearchDeskPanel({ marketId }: Props) {
  const { watchlist, commandHistory, result } = useTerminal();
  const session = useResearchSession();
  const workspace = useResearchWorkspace();
  const alerts = useResearchAlerts();
  const ledger = useSourceLedger(marketId);
  const reports = useResearchReports();
  const saveWorkspace = useSaveWorkspacePatch();
  const createAlert = useCreateResearchAlert();
  const createReport = useCreateResearchReport();

  const latestLedger = ledger.data?.items ?? [];
  const persisted = Boolean(session.data?.configured);
  const activeMarketIds = useMemo(() => {
    const ids = new Set<string>();
    if (marketId) ids.add(marketId);
    for (const id of watchlist.slice(0, 8)) ids.add(id);
    return Array.from(ids);
  }, [marketId, watchlist]);

  const reportBody = [
    `# Solvol Research Brief`,
    ``,
    `Focus market: ${marketId ? `#${marketId}` : "none"}`,
    `Watchlist: ${watchlist.map((id) => `#${id}`).join(", ") || "empty"}`,
    result ? `Catalyst confidence: ${result.confidence}% (${result.confidenceBand})` : "Catalyst confidence: not run",
    result ? `Summary: ${result.explanation}` : "",
  ].filter(Boolean).join("\n");

  return (
    <PanelFrame
      fkey="R1"
      title="Research Desk"
      subtitle={persisted ? "Supabase cloud" : "demo mode"}
      right={
        <button
          type="button"
          disabled={saveWorkspace.isPending}
          onClick={() =>
            saveWorkspace.mutate({
              watchlist,
              layout: {
                name: "Default terminal",
                layout: { mode: "research", commandHistory: commandHistory.slice(0, 12) },
              },
            })
          }
          className="rounded-sm border border-[var(--terminal-cyan)]/50 bg-[var(--terminal-cyan-soft)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--terminal-cyan)] hover:brightness-125 disabled:opacity-40"
        >
          {saveWorkspace.isPending ? "saving" : "save desk"}
        </button>
      }
      scroll
    >
      <div className="space-y-2 p-2">
        <div className="grid grid-cols-2 gap-1.5">
          <SmallStat label="Plan" value={session.data?.user.plan ?? "—"} />
          <SmallStat label="Saved" value={workspace.data?.workspace.savedMarkets.length ?? 0} />
          <SmallStat label="Alerts" value={alerts.data?.alerts.length ?? 0} />
          <SmallStat label="Ledger" value={latestLedger.length} />
        </div>

        <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 font-mono text-[10px] leading-relaxed text-[var(--terminal-muted)]">
          {persisted
            ? "Cloud persistence active. Source Ledger, reports, alerts and workspace data write to Supabase."
            : "Demo mode. Add Supabase env vars and run supabase/schema.sql to persist research data."}
        </div>

        <SubLabel>Actions</SubLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!marketId || saveWorkspace.isPending}
            onClick={() =>
              marketId
                ? saveWorkspace.mutate({
                    savedMarket: {
                      marketId,
                      marketTitle: result?.marketTitle ?? null,
                      folder: "Inbox",
                      tags: ["research"],
                      thesis: result?.explanation ?? null,
                    },
                  })
                : undefined
            }
            className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--terminal-text-2)] hover:border-[var(--terminal-cyan)]/60 hover:text-[var(--terminal-cyan)] disabled:opacity-40"
          >
            save market
          </button>
          <button
            type="button"
            disabled={!marketId || createAlert.isPending}
            onClick={() =>
              marketId
                ? createAlert.mutate({
                    marketId,
                    name: `Watch #${marketId}`,
                    kind: "watched_market",
                    threshold: null,
                  })
                : undefined
            }
            className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--terminal-text-2)] hover:border-[var(--terminal-amber)]/60 hover:text-[var(--terminal-amber)] disabled:opacity-40"
          >
            alert
          </button>
          <button
            type="button"
            disabled={!marketId || createReport.isPending}
            onClick={() =>
              createReport.mutate({
                title: marketId ? `Research brief #${marketId}` : "Research brief",
                marketIds: activeMarketIds,
                bodyMd: reportBody,
                isPublic: false,
              })
            }
            className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--terminal-text-2)] hover:border-[var(--terminal-violet)]/60 hover:text-[var(--terminal-violet)] disabled:opacity-40"
          >
            report
          </button>
          <button
            type="button"
            disabled={saveWorkspace.isPending}
            onClick={() =>
              saveWorkspace.mutate({
                savedScan: {
                  name: "Research worthy scan",
                  lane: "research_worthy",
                  filters: { limit: 60, savedAt: new Date().toISOString() },
                },
              })
            }
            className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--terminal-text-2)] hover:border-[var(--terminal-up)]/60 hover:text-[var(--terminal-up)] disabled:opacity-40"
          >
            save scan
          </button>
        </div>

        <SubLabel>Source Ledger</SubLabel>
        <div className="space-y-1">
          {latestLedger.slice(0, 5).map((entry) => (
            <a
              key={entry.id}
              href={entry.url ?? undefined}
              target={entry.url ? "_blank" : undefined}
              rel="noreferrer"
              className="block rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 hover:border-[var(--terminal-cyan)]/50"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--terminal-muted)]">
                  {entry.sourceType}
                </span>
                <span className="tnum ml-auto font-mono text-[10px] text-[var(--terminal-amber)]">
                  {entry.confidence}%
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[var(--terminal-text)]">
                {entry.title}
              </div>
            </a>
          ))}
          {!latestLedger.length ? (
            <div className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2 font-mono text-[10px] text-[var(--terminal-muted)]">
              Run a catalyst after Supabase is configured to populate ledger entries.
            </div>
          ) : null}
        </div>

        <SubLabel>Reports</SubLabel>
        <div className="space-y-1">
          {(reports.data?.items ?? []).slice(0, 4).map((report) => (
            <div
              key={report.id}
              className="rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] p-2"
            >
              <div className="truncate text-[11px] text-[var(--terminal-text)]">{report.title}</div>
              <div className="mt-0.5 font-mono text-[9.5px] text-[var(--terminal-muted)]">
                {report.marketIds.length} markets · {report.isPublic ? "public" : "private"}
              </div>
            </div>
          ))}
          {reports.isLoading ? (
            <div className="font-mono text-[10px] text-[var(--terminal-muted)]">loading reports…</div>
          ) : null}
        </div>
      </div>
    </PanelFrame>
  );
}
