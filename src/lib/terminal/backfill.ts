import { DEFAULT_TERMINAL_SOURCE_REGISTRY } from "./source-registry.ts";

export type TerminalBackfillKind = "markets" | "source";

export type TerminalBackfillPlanInput = {
  kind: TerminalBackfillKind;
  sourceId?: string;
  since?: string;
  until?: string;
  now?: string;
};

export type TerminalBackfillPlan = {
  readOnly: true;
  dryRun: true;
  kind: TerminalBackfillKind;
  sourceId: string;
  plannedAt: string;
  since?: string;
  until?: string;
  enabledByDefault: boolean;
  steps: string[];
};

function registryEnabled(sourceId: string): boolean {
  return DEFAULT_TERMINAL_SOURCE_REGISTRY.find((source) => source.sourceId === sourceId)?.enabled ?? false;
}

export function buildTerminalBackfillPlan(input: TerminalBackfillPlanInput): TerminalBackfillPlan {
  const plannedAt = input.now ?? new Date().toISOString();
  if (input.kind === "markets") {
    return {
      readOnly: true,
      dryRun: true,
      kind: "markets",
      sourceId: "polymarket-public",
      plannedAt,
      since: input.since,
      until: input.until,
      enabledByDefault: registryEnabled("polymarket-public"),
      steps: [
        "Read public Polymarket Gamma/CLOB/Data market registry pages.",
        "Normalize active markets, event metadata, slugs, and public links.",
        "Reconcile market_registry and market_price rows through the persistence boundary.",
        "Compute reaction-window candidates from public price history.",
        "Report row counts and cursors without placing trades or using authenticated Polymarket APIs.",
      ],
    };
  }

  const sourceId = input.sourceId ?? "gdelt-doc";
  return {
    readOnly: true,
    dryRun: true,
    kind: "source",
    sourceId,
    plannedAt,
    since: input.since,
    until: input.until,
    enabledByDefault: registryEnabled(sourceId),
    steps: [
      `Resolve source registry entry and feature flag for ${sourceId}.`,
      "Read the committed cursor and apply since/until bounds if provided.",
      "Fetch through the SourceAdapter boundary using rate-limit-safe options.",
      "Write immutable raw payload metadata and normalize NewsItem rows.",
      "Dedupe, cluster, score why-moved candidates, and publish outbox rows only after persistence succeeds.",
      "Report cursor and row-count deltas without mutating external systems.",
    ],
  };
}
