import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  evaluateTerminalBridgeCanaryReadiness,
} from "../src/lib/terminal/canary-readiness.ts";

const execFileAsync = promisify(execFile);

const READY_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SOLVOL_RAW_STORAGE_BUCKET: "terminal-raw",
  SOLVOL_BRIDGE_BROADCASTER_URL: "redis://localhost:6379",
  SOLVOL_ERROR_MONITORING_DSN: "https://errors.example/project",
  SOLVOL_METRICS_DSN: "https://metrics.example/project",
  SOLVOL_ALERT_ROUTING_URL: "https://alerts.example/route",
  SOLVOL_DEPLOY_TARGET: "vercel:solvol-staging",
  SOLVOL_POSTGRES_BACKUP_VERIFIED: "true",
  SOLVOL_SOURCE_POLICY_REVIEWED: "true",
  SOLVOL_CANARY_OWNER: "ops@example.com",
  SOLVOL_CANARY_REVIEWER: "reviewer@example.com",
  SOLVOL_ROLLBACK_APPROVER: "lead@example.com",
};

test("canary readiness reports missing mandatory production inputs", () => {
  const readiness = evaluateTerminalBridgeCanaryReadiness({});

  assert.equal(readiness.readOnly, true);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missingInputs.includes("SUPABASE_URL"));
  assert.ok(readiness.missingInputs.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(readiness.missingInputs.includes("SOLVOL_BRIDGE_BROADCASTER_URL or SOLVOL_BRIDGE_REDIS_URL"));
  assert.ok(readiness.missingInputs.includes("SOLVOL_ALERT_ROUTING_URL"));
  assert.ok(readiness.missingInputs.includes("SOLVOL_CANARY_REVIEWER"));
  assert.ok(readiness.missingInputs.includes("SOLVOL_ROLLBACK_APPROVER"));
});

test("canary readiness passes when all mandatory inputs and approvals are present", () => {
  const readiness = evaluateTerminalBridgeCanaryReadiness(READY_ENV);

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missingInputs, []);
  assert.ok(readiness.checks.every((check) => check.status === "pass"));
});

test("canary readiness requires Ethereum RPC details only when on-chain ingest is enabled", () => {
  const withoutRpc = evaluateTerminalBridgeCanaryReadiness({
    ...READY_ENV,
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_ETHEREUM_JSON_RPC: "true",
  });
  assert.equal(withoutRpc.ready, false);
  assert.ok(withoutRpc.missingInputs.includes("SOLVOL_TERMINAL_ETHEREUM_RPC_URL"));
  assert.ok(withoutRpc.missingInputs.includes("SOLVOL_TERMINAL_ETHEREUM_CONTRACTS or SOLVOL_TERMINAL_ETHEREUM_TOPICS"));

  const withRpc = evaluateTerminalBridgeCanaryReadiness({
    ...READY_ENV,
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_ETHEREUM_JSON_RPC: "true",
    SOLVOL_TERMINAL_ETHEREUM_RPC_URL: "https://rpc.example",
    SOLVOL_TERMINAL_ETHEREUM_TOPICS: "0xddf252ad",
  });
  assert.equal(withRpc.ready, true);
});

test("canary readiness requires source config for enabled source flags", () => {
  const missingConfig = evaluateTerminalBridgeCanaryReadiness({
    ...READY_ENV,
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GNEWS_API: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_REDDIT_OAUTH: "true",
  });

  assert.equal(missingConfig.ready, false);
  assert.ok(missingConfig.missingInputs.includes("SOLVOL_TERMINAL_GNEWS_API_KEY"));
  assert.ok(missingConfig.missingInputs.includes("SOLVOL_TERMINAL_GNEWS_TERMS"));
  assert.ok(missingConfig.missingInputs.includes("SOLVOL_TERMINAL_REDDIT_ACCESS_TOKEN"));
  assert.ok(missingConfig.missingInputs.includes("SOLVOL_TERMINAL_REDDIT_TERMS"));
  assert.ok(missingConfig.missingInputs.includes("SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES"));

  const withConfig = evaluateTerminalBridgeCanaryReadiness({
    ...READY_ENV,
    SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GNEWS_API: "true",
    SOLVOL_TERMINAL_GNEWS_API_KEY: "gnews-key",
    SOLVOL_TERMINAL_GNEWS_TERMS: "SpaceX, Starship",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_REDDIT_OAUTH: "true",
    SOLVOL_TERMINAL_REDDIT_ACCESS_TOKEN: "reddit-token",
    SOLVOL_TERMINAL_REDDIT_TERMS: "SpaceX, Starship",
  });

  assert.equal(withConfig.ready, true);
});

test("bridge canary check command emits read-only readiness payload", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/bridge.mjs",
    "bridge:canary:check",
  ], {
    env: {
      ...process.env,
      ...READY_ENV,
    },
  });
  const payload = JSON.parse(stdout) as {
    readOnly?: boolean;
    dryRun?: boolean;
    canaryReadiness?: { readOnly?: boolean; ready?: boolean; missingInputs?: string[] };
  };

  assert.equal(payload.readOnly, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.canaryReadiness?.readOnly, true);
  assert.equal(payload.canaryReadiness?.ready, true);
  assert.deepEqual(payload.canaryReadiness?.missingInputs, []);
});
