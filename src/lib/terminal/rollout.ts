import { evaluateTerminalBridgeCanaryReadiness } from "./canary-readiness.ts";
import type { BridgeFeatureFlagName } from "./bridge-control.ts";

export type TerminalBridgeRolloutPhaseId =
  | "local_ci"
  | "staging_shadow"
  | "staging_active"
  | "production_canary"
  | "general_rollout";

export type TerminalBridgeRolloutStatus = "ready" | "blocked";
export type TerminalBridgeRolloutAudience = "none" | "internal" | "canary" | "public";

export type TerminalBridgeRolloutGate = {
  id: string;
  label: string;
  requiredInputs: string[];
  missingInputs: string[];
  note: string;
};

export type TerminalBridgeRolloutPhase = {
  id: TerminalBridgeRolloutPhaseId;
  label: string;
  status: TerminalBridgeRolloutStatus;
  audience: TerminalBridgeRolloutAudience;
  userFacingExplanationCards: boolean;
  requiredFeatureFlags: BridgeFeatureFlagName[];
  gates: TerminalBridgeRolloutGate[];
  missingInputs: string[];
};

export type TerminalBridgeRolloutPlan = {
  readOnly: true;
  readyForProductionCanary: boolean;
  readyForGeneralRollout: boolean;
  nextBlockedPhase: TerminalBridgeRolloutPhase | null;
  phases: TerminalBridgeRolloutPhase[];
};

type Env = Record<string, string | undefined>;

function present(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function truthy(env: Env, name: string): boolean {
  return /^(1|true|yes|on)$/i.test(env[name]?.trim() ?? "");
}

function requiredGate(
  env: Env,
  id: string,
  label: string,
  requiredInputs: string[],
  note: string,
): TerminalBridgeRolloutGate {
  const missingInputs = requiredInputs.filter((name) => !present(env, name));
  return { id, label, requiredInputs, missingInputs, note };
}

function truthyGate(
  env: Env,
  id: string,
  label: string,
  requiredInput: string,
  note: string,
): TerminalBridgeRolloutGate {
  return {
    id,
    label,
    requiredInputs: [requiredInput],
    missingInputs: truthy(env, requiredInput) ? [] : [requiredInput],
    note,
  };
}

function phase(
  id: TerminalBridgeRolloutPhaseId,
  label: string,
  gates: TerminalBridgeRolloutGate[],
  audience: TerminalBridgeRolloutAudience,
  userFacingExplanationCards: boolean,
  requiredFeatureFlags: BridgeFeatureFlagName[] = [],
): TerminalBridgeRolloutPhase {
  const missingInputs = [...new Set(gates.flatMap((gate) => gate.missingInputs))];
  return {
    id,
    label,
    status: missingInputs.length === 0 ? "ready" : "blocked",
    audience,
    userFacingExplanationCards,
    requiredFeatureFlags,
    gates,
    missingInputs,
  };
}

function stagingShadowGates(env: Env): TerminalBridgeRolloutGate[] {
  return [
    requiredGate(
      env,
      "database",
      "Postgres/Supabase configured",
      ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      "Needed for cursors, bridge rows, outbox state, and source health.",
    ),
    requiredGate(
      env,
      "raw_storage",
      "Raw payload storage configured",
      ["SOLVOL_RAW_STORAGE_BUCKET"],
      "Needed for immutable raw payload envelopes and replay windows.",
    ),
    requiredGate(
      env,
      "fanout_or_queue",
      "Realtime fanout or queue configured",
      present(env, "SOLVOL_BRIDGE_BROADCASTER_URL") ? ["SOLVOL_BRIDGE_BROADCASTER_URL"] : ["SOLVOL_BRIDGE_REDIS_URL"],
      "Needed before live staging delivery tests.",
    ),
    requiredGate(
      env,
      "observability",
      "Metrics, errors, and alert routing configured",
      ["SOLVOL_ERROR_MONITORING_DSN", "SOLVOL_METRICS_DSN", "SOLVOL_ALERT_ROUTING_URL"],
      "Needed for source failure, replay, DLQ, and fanout lag alerts.",
    ),
    requiredGate(
      env,
      "deploy_target",
      "Deployment target configured",
      ["SOLVOL_DEPLOY_TARGET"],
      "Needed to identify the staging deployment target.",
    ),
    truthyGate(
      env,
      "source_policy_review",
      "Source policy review complete",
      "SOLVOL_SOURCE_POLICY_REVIEWED",
      "Must be true before live source polling leaves local/demo mode.",
    ),
  ];
}

function stagingActiveGates(env: Env): TerminalBridgeRolloutGate[] {
  return [
    truthyGate(
      env,
      "shadow_soak",
      "Staging shadow soak passed",
      "SOLVOL_STAGING_SHADOW_SOAK_PASSED",
      "Live ingest must be stable before internal why-moved cards are visible.",
    ),
    truthyGate(
      env,
      "replay_determinism",
      "Replay determinism verified",
      "SOLVOL_REPLAY_DETERMINISM_VERIFIED",
      "Pinned replay windows must remain deterministic before promotion.",
    ),
    truthyGate(
      env,
      "analyst_qa",
      "Analyst QA approved",
      "SOLVOL_ANALYST_QA_APPROVED",
      "Manual analyst review must pass for high-confidence explanation cards.",
    ),
  ];
}

function productionCanaryGates(env: Env): TerminalBridgeRolloutGate[] {
  return evaluateTerminalBridgeCanaryReadiness(env).checks.map((check) => ({
    id: check.id,
    label: check.label,
    requiredInputs: check.requiredInputs,
    missingInputs: check.missingInputs,
    note: check.note,
  }));
}

function generalRolloutGates(env: Env): TerminalBridgeRolloutGate[] {
  return [
    truthyGate(
      env,
      "canary_window",
      "Canary window passed",
      "SOLVOL_CANARY_WINDOW_PASSED",
      "One full production canary window must pass without rollback.",
    ),
    truthyGate(
      env,
      "no_high_severity_defects",
      "No unresolved P1/P2 defects",
      "SOLVOL_NO_P1_P2_DEFECTS",
      "General rollout stays blocked while high-severity defects are open.",
    ),
  ];
}

export function buildTerminalBridgeRolloutPlan(
  env: Env = process.env,
): TerminalBridgeRolloutPlan {
  const phases = [
    phase("local_ci", "Local and CI", [], "none", false),
    phase("staging_shadow", "Staging shadow", stagingShadowGates(env), "none", false),
    phase("staging_active", "Staging active", stagingActiveGates(env), "internal", true),
    phase("production_canary", "Production canary", productionCanaryGates(env), "canary", true, [
      "bridge.cluster.v1",
      "bridge.correlation.whyMovedV1",
      "bridge.realtime.sse",
      "bridge.ui.provenancePanel",
    ]),
    phase("general_rollout", "General rollout", generalRolloutGates(env), "public", true),
  ];
  const productionCanary = phases.find((item) => item.id === "production_canary");
  const generalRollout = phases.find((item) => item.id === "general_rollout");
  return {
    readOnly: true,
    readyForProductionCanary: productionCanary?.status === "ready",
    readyForGeneralRollout: generalRollout?.status === "ready",
    nextBlockedPhase: phases.find((item) => item.status === "blocked") ?? null,
    phases,
  };
}
