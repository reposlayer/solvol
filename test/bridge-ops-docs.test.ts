import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("bridge operations runbook documents canary readiness and rollback paths", async () => {
  const runbook = await readFile("docs/terminal-bridge-operations.md", "utf8");
  const audit = await readFile("docs/terminal-bridge-completion-audit.md", "utf8");
  const deployment = await readFile("docs/vercel-supabase-deployment.md", "utf8");
  const envTemplate = await readFile("docs/production-canary.env.template", "utf8");

  for (const heading of [
    "Source Onboarding",
    "Source Outage",
    "Rate-Limit Incident",
    "Replay",
    "Why-Moved False Positive",
    "Migration Failure",
    "Rollback",
    "Staging Shadow",
    "Staging Active",
    "Production Canary",
  ]) {
    assert.match(runbook, new RegExp(`## ${heading}`));
  }

  for (const command of [
    "npm run bridge:health",
    "npm run bridge:replay",
    "npm run bridge:inject:synthetic",
    "npm run bridge:pause-source",
    "npm run bridge:resume-source",
    "npm run bridge:audit",
    "npm run bridge:canary:env-template",
  ]) {
    assert.match(runbook, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(runbook, /read-only/i);
  assert.match(runbook, /source lag/i);
  assert.match(runbook, /DLQ/i);
  assert.match(runbook, /fanout latency/i);
  assert.match(runbook, /rollback owner/i);
  assert.match(runbook, /canary reviewer/i);
  assert.match(runbook, /completion audit/i);
  assert.match(runbook, /readyForProductionCanary/);
  assert.match(runbook, /readyForGeneralRollout/);
  assert.match(runbook, /accessPrerequisites/);
  assert.match(runbook, /generalRolloutTemplate/);
  assert.match(runbook, /Secret Exposure Response/i);
  assert.match(runbook, /rotate/i);
  assert.match(runbook, /JWT secret/i);
  assert.match(runbook, /service_role/i);
  assert.match(audit, /Prompt-To-Artifact Checklist/i);
  assert.match(audit, /production canary remains blocked/i);
  assert.match(deployment, /Access Prerequisites/i);
  assert.match(deployment, /Secret Exposure Response/i);
  assert.match(deployment, /Vercel project settings/i);
  assert.match(deployment, /Vercel team/i);
  assert.match(deployment, /Supabase project/i);
  assert.match(deployment, /service role key/i);
  assert.match(deployment, /publishable/i);
  assert.match(deployment, /secret key/i);
  assert.match(deployment, /JWT secret/i);
  assert.match(deployment, /rotate/i);
  assert.match(deployment, /observability/i);
  assert.match(deployment, /alert routing/i);
  assert.match(deployment, /source policy/i);
  assert.match(deployment, /rollback approver/i);
  assert.match(deployment, /Vercel Environment Matrix/i);
  assert.match(deployment, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(deployment, /SOLVOL_BRIDGE_REDIS_URL/i);
  assert.match(deployment, /SOLVOL_CANARY_REVIEWER/i);
  assert.match(deployment, /SOLVOL_ROLLBACK_APPROVER/i);
  assert.match(deployment, /npm run bridge:canary:env-template/i);
  assert.match(deployment, /npm run bridge:audit/i);
  assert.match(deployment, /git diff --check/i);
  assert.match(deployment, /generalRolloutTemplate/i);
  assert.match(deployment, /accessPrerequisites/i);
  assert.match(deployment, /docs\/production-canary\.env\.template/i);
  assert.match(deployment, /do not commit real/i);

  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SOLVOL_RAW_STORAGE_BUCKET",
    "SOLVOL_BRIDGE_BROADCASTER_URL",
    "SOLVOL_BRIDGE_REDIS_URL",
    "SOLVOL_ERROR_MONITORING_DSN",
    "SOLVOL_METRICS_DSN",
    "SOLVOL_ALERT_ROUTING_URL",
    "SOLVOL_DEPLOY_TARGET",
    "SOLVOL_POSTGRES_BACKUP_VERIFIED",
    "SOLVOL_SOURCE_POLICY_REVIEWED",
    "SOLVOL_SECRET_ROTATION_VERIFIED",
    "SOLVOL_CANARY_OWNER",
    "SOLVOL_CANARY_REVIEWER",
    "SOLVOL_ROLLBACK_APPROVER",
    "SOLVOL_STAGING_SHADOW_SOAK_PASSED",
    "SOLVOL_REPLAY_DETERMINISM_VERIFIED",
    "SOLVOL_ANALYST_QA_APPROVED",
    "SOLVOL_CANARY_WINDOW_PASSED",
    "SOLVOL_NO_P1_P2_DEFECTS",
  ]) {
    assert.match(envTemplate, new RegExp(`^${name}=`, "m"));
  }

  assert.match(envTemplate, /Generated from `npm run bridge:canary:env-template`/);
  assert.doesNotMatch(envTemplate, /sk_|eyJ|postgres:\/\/|redis:\/\/|https:\/\/[^<\s]+/i);
});
