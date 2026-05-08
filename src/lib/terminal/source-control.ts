import { bridgeSourceFlagName } from "./bridge-control.ts";
import { DEFAULT_TERMINAL_SOURCE_REGISTRY } from "./source-registry.ts";

export type TerminalSourceControlAction = "pause" | "resume";

export type TerminalSourceControlPlan = {
  readOnly: true;
  dryRun: true;
  ok: boolean;
  action: TerminalSourceControlAction;
  sourceId: string;
  featureFlag: string;
  plannedAt: string;
  operatorIntent: string;
  steps: string[];
  error?: "unknown_source";
};

export type TerminalSourceControlPlanInput = {
  action: TerminalSourceControlAction;
  sourceId?: string;
  reason?: string;
  now?: string;
};

function sourceLabel(sourceId: string): string {
  return DEFAULT_TERMINAL_SOURCE_REGISTRY.find((source) => source.sourceId === sourceId)?.label ?? sourceId;
}

export function buildTerminalSourceControlPlan(
  input: TerminalSourceControlPlanInput,
): TerminalSourceControlPlan {
  const sourceId = input.sourceId?.trim() || "unknown";
  const source = DEFAULT_TERMINAL_SOURCE_REGISTRY.find((entry) => entry.sourceId === sourceId);
  const featureFlag = bridgeSourceFlagName(sourceId);
  const plannedAt = input.now ?? new Date().toISOString();
  const verb = input.action === "pause" ? "pause" : "resume";
  const reason = input.reason?.trim();

  if (!source) {
    return {
      readOnly: true,
      dryRun: true,
      ok: false,
      action: input.action,
      sourceId,
      featureFlag,
      plannedAt,
      operatorIntent: `Cannot ${verb} unknown source ${sourceId}.`,
      steps: [
        "Check the source id against the terminal source registry before changing runtime flags.",
        "Do not mutate cursors, raw payloads, or normalized bridge rows for unknown sources.",
      ],
      error: "unknown_source",
    };
  }

  const label = sourceLabel(sourceId);
  const flagValue = input.action === "pause" ? "false" : "true";
  const steps = input.action === "pause"
    ? [
      `Set ${featureFlag} to ${flagValue} in the runtime flag system for ${label}.`,
      "Preserve source cursor state so replay and recovery can resume from the last committed checkpoint.",
      "Do not delete raw payload metadata, normalized news, event clusters, outbox rows, or DLQ entries.",
      "Run a synthetic source-outage or rate-limit drill if this pause is incident-related.",
      "Record owner, reason, timestamp, and expected review time in the operations log.",
    ]
    : [
      "Confirm the source policy, rate-limit budget, and upstream health before reenabling.",
      "Run replay against the last affected window before user-facing why-moved cards are promoted.",
      `Set ${featureFlag} to ${flagValue} in the runtime flag system for ${label}.`,
      "Watch source lag, accepted item counts, DLQ growth, and fanout latency after resume.",
    ];

  return {
    readOnly: true,
    dryRun: true,
    ok: true,
    action: input.action,
    sourceId,
    featureFlag,
    plannedAt,
    operatorIntent: `${verb} ${label}${reason ? ` because ${reason}` : ""}.`,
    steps,
  };
}
