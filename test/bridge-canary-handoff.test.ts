import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  buildTerminalBridgeCanaryEnvTemplate,
  buildTerminalBridgeCanaryHandoff,
} from "../src/lib/terminal/canary-handoff.ts";

test("canary handoff aggregates readiness, rollout, policy, and observability blockers", () => {
  const handoff = buildTerminalBridgeCanaryHandoff({});

  assert.equal(handoff.readOnly, true);
  assert.equal(handoff.readyForProductionCanary, false);
  assert.equal(handoff.readyForGeneralRollout, false);
  assert.equal(handoff.canaryReadiness.ready, false);
  assert.equal(handoff.rollout.readyForProductionCanary, false);
  assert.equal(handoff.sourcePolicy.reviewComplete, false);
  assert.equal(handoff.observability.ready, false);
  assert.ok(handoff.blockerSummary.length >= 8);
  assert.deepEqual(
    handoff.accessPrerequisites.map((prerequisite) => prerequisite.id),
    [
      "vercel_project_settings",
      "supabase_project_admin",
      "observability_alert_routing",
      "canary_ownership_approval",
    ],
  );
  const approvalPrerequisite = handoff.accessPrerequisites.find((prerequisite) => (
    prerequisite.id === "canary_ownership_approval"
  ));
  assert.ok(approvalPrerequisite);
  assert.ok(
    approvalPrerequisite.requiredAccess.some((item) => /secret exposure rotation/i.test(item)),
    "canary access prerequisites must name secret exposure rotation review",
  );

  const blockers = new Set(handoff.blockerSummary.flatMap((blocker) => blocker.missingInputs));
  for (const input of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SOLVOL_RAW_STORAGE_BUCKET",
    "SOLVOL_METRICS_DSN",
    "SOLVOL_ALERT_ROUTING_URL",
    "SOLVOL_SOURCE_POLICY_REVIEWED",
    "SOLVOL_SECRET_ROTATION_VERIFIED",
    "SOLVOL_CANARY_OWNER",
    "SOLVOL_CANARY_REVIEWER",
    "SOLVOL_ROLLBACK_APPROVER",
  ]) {
    assert.ok(blockers.has(input), `missing handoff blocker ${input}`);
  }
});

test("canary handoff becomes ready when canary and rollout gates are configured", () => {
  const env = {
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
  };

  const handoff = buildTerminalBridgeCanaryHandoff(env);

  assert.equal(handoff.readyForProductionCanary, true);
  assert.equal(handoff.readyForGeneralRollout, false);
  assert.deepEqual(handoff.blockerSummary, []);
  assert.equal(handoff.nextAction, "Production canary may start behind bridge feature flags after operator confirmation.");
});

test("bridge canary command includes the canary handoff report", () => {
  const payload = JSON.parse(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/bridge.mjs", "bridge:canary:check"],
    { encoding: "utf8" },
  ));

  assert.equal(payload.readOnly, true);
  assert.equal(payload.canaryHandoff.readOnly, true);
  assert.equal(payload.canaryHandoff.readyForProductionCanary, false);
  assert.ok(Array.isArray(payload.canaryHandoff.blockerSummary));
});

test("canary env template emits shell-safe missing input checklist", () => {
  const handoff = buildTerminalBridgeCanaryEnvTemplate({});

  assert.equal(handoff.readOnly, true);
  assert.equal(handoff.readyForProductionCanary, false);
  assert.equal(handoff.readyForGeneralRollout, false);
  assert.ok(handoff.missingInputs.includes("SUPABASE_URL"));
  assert.ok(handoff.generalRolloutMissingInputs.includes("SOLVOL_CANARY_WINDOW_PASSED"));
  assert.ok(handoff.generalRolloutMissingInputs.includes("SOLVOL_NO_P1_P2_DEFECTS"));
  assert.ok(handoff.accessPrerequisites.some((prerequisite) => /Vercel team\/project settings access/i.test(prerequisite.label)));
  assert.ok(handoff.accessPrerequisites.some((prerequisite) => /Supabase project admin access/i.test(prerequisite.label)));
  assert.ok(handoff.missingInputs.includes("SOLVOL_BRIDGE_BROADCASTER_URL"));
  assert.ok(handoff.missingInputs.includes("SOLVOL_BRIDGE_REDIS_URL"));
  assert.match(handoff.template, /^SUPABASE_URL=$/m);
  assert.match(handoff.template, /^SUPABASE_SERVICE_ROLE_KEY=$/m);
  assert.match(handoff.template, /^SOLVOL_POSTGRES_BACKUP_VERIFIED=false$/m);
  assert.match(handoff.template, /^SOLVOL_SECRET_ROTATION_VERIFIED=false$/m);
  assert.match(handoff.generalRolloutTemplate, /^SOLVOL_CANARY_WINDOW_PASSED=false$/m);
  assert.match(handoff.generalRolloutTemplate, /^SOLVOL_NO_P1_P2_DEFECTS=false$/m);
  assert.doesNotMatch(handoff.template, /\s+or\s+/);
});

test("bridge canary env template command emits read-only template payload", () => {
  const payload = JSON.parse(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/bridge.mjs", "bridge:canary:env-template"],
    { encoding: "utf8" },
  ));

  assert.equal(payload.readOnly, true);
  assert.equal(payload.canaryEnvTemplate.readOnly, true);
  assert.equal(payload.canaryEnvTemplate.readyForProductionCanary, false);
  assert.equal(payload.canaryEnvTemplate.readyForGeneralRollout, false);
  assert.ok(Array.isArray(payload.canaryEnvTemplate.accessPrerequisites));
  assert.ok(payload.canaryEnvTemplate.accessPrerequisites.some((prerequisite: { id: string }) => prerequisite.id === "vercel_project_settings"));
  assert.match(payload.canaryEnvTemplate.template, /^SOLVOL_CANARY_OWNER=$/m);
  assert.match(payload.canaryEnvTemplate.template, /^SOLVOL_CANARY_REVIEWER=$/m);
  assert.match(payload.canaryEnvTemplate.generalRolloutTemplate, /^SOLVOL_CANARY_WINDOW_PASSED=false$/m);
});
