export type TerminalBridgeDashboardSpec = {
  id: string;
  label: string;
  description: string;
  metrics: string[];
  requiresMetricsBackend: boolean;
};

export type TerminalBridgeAlertSpec = {
  id: string;
  label: string;
  description: string;
  metric: string;
  threshold: string;
  severity: "warning" | "critical";
  requiresRouting: boolean;
};

export type TerminalBridgeObservabilityCatalog = {
  readOnly: true;
  ready: boolean;
  missingInputs: string[];
  dashboards: TerminalBridgeDashboardSpec[];
  alerts: TerminalBridgeAlertSpec[];
};

type Env = Record<string, string | undefined>;

const REQUIRED_INPUTS = [
  "SOLVOL_METRICS_DSN",
  "SOLVOL_ALERT_ROUTING_URL",
];

const DASHBOARDS: TerminalBridgeDashboardSpec[] = [
  {
    id: "source_health",
    label: "Source Health",
    description: "Tracks source lag, failures, acceptance counts, and backlog before staging or canary promotion.",
    metrics: [
      "source.lag.seconds",
      "source.errors.count",
      "source.backlog.count",
      "source.accepted.count",
      "source.rejected.count",
    ],
    requiresMetricsBackend: true,
  },
  {
    id: "normalization_quality",
    label: "Normalization Quality",
    description: "Tracks normalized item throughput, dedupe collapse, cluster quality samples, and official-source share.",
    metrics: [
      "normalization.success.count",
      "normalization.failure.count",
      "dedupe.collapse_ratio",
      "cluster.purity_sample",
      "why_moved.official_source_share",
    ],
    requiresMetricsBackend: true,
  },
  {
    id: "replay_and_dlq",
    label: "Replay And DLQ",
    description: "Tracks replay determinism and replayable dead-letter growth.",
    metrics: [
      "replay.deterministic_cluster_share",
      "replay.why_moved_precision_top1",
      "replay.why_moved_precision_top3",
      "dlq.replayable.count",
      "dlq.total.count",
    ],
    requiresMetricsBackend: true,
  },
  {
    id: "delivery_fanout",
    label: "Delivery Fanout",
    description: "Tracks outbox backlog and realtime delivery latency for terminal update surfaces.",
    metrics: [
      "outbox.backlog.count",
      "outbox.oldest_unsent_age.seconds",
      "fanout.latency.ms",
      "fanout.errors.count",
    ],
    requiresMetricsBackend: true,
  },
];

const ALERTS: TerminalBridgeAlertSpec[] = [
  {
    id: "source_failure",
    label: "Source Failure",
    description: "A source has repeated failures or stale cursor lag.",
    metric: "source.errors.count",
    threshold: "consecutive_failures >= 3 or source.lag.seconds above source SLA",
    severity: "critical",
    requiresRouting: true,
  },
  {
    id: "rate_limit_incident",
    label: "Rate-Limit Incident",
    description: "A public source returned rate-limit or block responses and should be degraded behind flags.",
    metric: "source.rate_limit.count",
    threshold: "count > 0 in one scheduler window",
    severity: "warning",
    requiresRouting: true,
  },
  {
    id: "replay_nondeterminism",
    label: "Replay Nondeterminism",
    description: "Pinned replay window no longer reproduces deterministic clusters or why-moved scores.",
    metric: "replay.deterministic_cluster_share",
    threshold: "< 1.0 for pinned fixture windows",
    severity: "critical",
    requiresRouting: true,
  },
  {
    id: "dlq_growth",
    label: "DLQ Growth",
    description: "Replayable dead-letter count grows across consecutive bridge runs.",
    metric: "dlq.replayable.count",
    threshold: "increases across two consecutive scheduler runs",
    severity: "warning",
    requiresRouting: true,
  },
  {
    id: "fanout_lag",
    label: "Fanout Lag",
    description: "Unread delivery outbox age or realtime fanout latency exceeds staging target.",
    metric: "fanout.latency.ms",
    threshold: "above configured staging target",
    severity: "critical",
    requiresRouting: true,
  },
];

function present(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

export function buildTerminalBridgeObservabilityCatalog(
  env: Env = process.env,
): TerminalBridgeObservabilityCatalog {
  const missingInputs = REQUIRED_INPUTS.filter((name) => !present(env, name));
  return {
    readOnly: true,
    ready: missingInputs.length === 0,
    missingInputs,
    dashboards: DASHBOARDS,
    alerts: ALERTS,
  };
}
