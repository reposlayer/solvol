import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildTerminalBridgeRolloutPlan,
} from "../src/lib/terminal/rollout.ts";

test("rollout plan maps bridge phases to concrete missing gates", () => {
  const plan = buildTerminalBridgeRolloutPlan({});

  assert.equal(plan.readOnly, true);
  assert.equal(plan.readyForProductionCanary, false);
  assert.equal(plan.readyForGeneralRollout, false);
  assert.deepEqual(plan.phases.map((phase) => phase.id), [
    "local_ci",
    "staging_shadow",
    "staging_active",
    "production_canary",
    "general_rollout",
  ]);

  assert.equal(plan.phases[0]?.status, "ready");
  assert.equal(plan.phases[1]?.status, "blocked");
  assert.equal(plan.phases[3]?.status, "blocked");
  assert.equal(plan.phases.find((phase) => phase.id === "staging_shadow")?.audience, "none");
  assert.equal(plan.phases.find((phase) => phase.id === "staging_shadow")?.userFacingExplanationCards, false);
  assert.equal(plan.phases.find((phase) => phase.id === "staging_active")?.audience, "internal");
  assert.equal(plan.phases.find((phase) => phase.id === "production_canary")?.audience, "canary");
  assert.deepEqual(plan.phases.find((phase) => phase.id === "production_canary")?.requiredFeatureFlags, [
    "bridge.cluster.v1",
    "bridge.correlation.whyMovedV1",
    "bridge.realtime.sse",
    "bridge.ui.provenancePanel",
  ]);
  assert.equal(plan.phases.find((phase) => phase.id === "general_rollout")?.audience, "public");
  assert.ok(plan.nextBlockedPhase?.id === "staging_shadow");

  const missing = new Set(plan.phases.flatMap((phase) => phase.missingInputs));
  for (const input of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SOLVOL_RAW_STORAGE_BUCKET",
    "SOLVOL_DEPLOY_TARGET",
    "SOLVOL_SOURCE_POLICY_REVIEWED",
    "SOLVOL_SECRET_ROTATION_VERIFIED",
    "SOLVOL_CANARY_OWNER",
    "SOLVOL_CANARY_REVIEWER",
    "SOLVOL_ROLLBACK_APPROVER",
  ]) {
    assert.ok(missing.has(input), `missing rollout gate ${input}`);
  }
});

test("rollout plan only reaches canary when infrastructure, policy, QA, and ownership gates are present", () => {
  const plan = buildTerminalBridgeRolloutPlan({
    SUPABASE_URL: "https://db.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SOLVOL_RAW_STORAGE_BUCKET: "terminal-raw",
    SOLVOL_BRIDGE_REDIS_URL: "redis://localhost:6379",
    SOLVOL_ERROR_MONITORING_DSN: "https://errors.example.test",
    SOLVOL_METRICS_DSN: "https://metrics.example.test",
    SOLVOL_ALERT_ROUTING_URL: "https://alerts.example.test",
    SOLVOL_DEPLOY_TARGET: "staging",
    SOLVOL_POSTGRES_BACKUP_VERIFIED: "true",
    SOLVOL_SOURCE_POLICY_REVIEWED: "true",
    SOLVOL_SECRET_ROTATION_VERIFIED: "true",
    SOLVOL_STAGING_SHADOW_SOAK_PASSED: "true",
    SOLVOL_REPLAY_DETERMINISM_VERIFIED: "true",
    SOLVOL_ANALYST_QA_APPROVED: "true",
    SOLVOL_CANARY_OWNER: "ops@example.test",
    SOLVOL_CANARY_REVIEWER: "reviewer@example.test",
    SOLVOL_ROLLBACK_APPROVER: "lead@example.test",
  });

  assert.equal(plan.readyForProductionCanary, true);
  assert.equal(plan.readyForGeneralRollout, false);
  assert.equal(plan.phases.find((phase) => phase.id === "staging_shadow")?.status, "ready");
  assert.equal(plan.phases.find((phase) => phase.id === "staging_active")?.status, "ready");
  assert.equal(plan.phases.find((phase) => phase.id === "production_canary")?.status, "ready");
  assert.equal(plan.phases.find((phase) => phase.id === "general_rollout")?.status, "blocked");
});

test("rollout plan only reaches general rollout after canary window and defect gates pass", () => {
  const plan = buildTerminalBridgeRolloutPlan({
    SUPABASE_URL: "https://db.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SOLVOL_RAW_STORAGE_BUCKET: "terminal-raw",
    SOLVOL_BRIDGE_REDIS_URL: "redis://localhost:6379",
    SOLVOL_ERROR_MONITORING_DSN: "https://errors.example.test",
    SOLVOL_METRICS_DSN: "https://metrics.example.test",
    SOLVOL_ALERT_ROUTING_URL: "https://alerts.example.test",
    SOLVOL_DEPLOY_TARGET: "staging",
    SOLVOL_POSTGRES_BACKUP_VERIFIED: "true",
    SOLVOL_SOURCE_POLICY_REVIEWED: "true",
    SOLVOL_SECRET_ROTATION_VERIFIED: "true",
    SOLVOL_STAGING_SHADOW_SOAK_PASSED: "true",
    SOLVOL_REPLAY_DETERMINISM_VERIFIED: "true",
    SOLVOL_ANALYST_QA_APPROVED: "true",
    SOLVOL_CANARY_OWNER: "ops@example.test",
    SOLVOL_CANARY_REVIEWER: "reviewer@example.test",
    SOLVOL_ROLLBACK_APPROVER: "lead@example.test",
    SOLVOL_CANARY_WINDOW_PASSED: "true",
    SOLVOL_NO_P1_P2_DEFECTS: "true",
  });

  assert.equal(plan.readyForProductionCanary, true);
  assert.equal(plan.readyForGeneralRollout, true);
  assert.equal(plan.phases.find((phase) => phase.id === "general_rollout")?.status, "ready");
});

test("rollout gate inputs are documented for operators", async () => {
  const plan = buildTerminalBridgeRolloutPlan({});
  const requiredInputs = Array.from(new Set(
    plan.phases.flatMap((phase) =>
      phase.missingInputs.flatMap((input) => input.split(/\s+or\s+/)),
    ),
  ));
  const envExample = await readFile(".env.example", "utf8");
  const runbook = await readFile("docs/terminal-bridge-operations.md", "utf8");

  for (const input of requiredInputs) {
    assert.match(envExample, new RegExp(`^${input}=`, "m"), `${input} must be listed in .env.example`);
    assert.match(runbook, new RegExp(input), `${input} must be named in the operations runbook`);
  }
});
