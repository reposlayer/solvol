import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  TERMINAL_RETENTION_POLICIES,
  buildTerminalRetentionPlan,
  selectMarketPriceDownsamplePoints,
} from "../src/lib/terminal/retention.ts";

const NOW = "2026-05-07T12:00:00.000Z";
const execFileAsync = promisify(execFile);

test("retention planner covers raw, normalized, cluster, and market price data", () => {
  const plan = buildTerminalRetentionPlan({ now: NOW });

  assert.equal(plan.readOnly, true);
  assert.equal(plan.dryRun, true);
  assert.deepEqual(TERMINAL_RETENTION_POLICIES.map((policy) => policy.dataset), [
    "raw_document",
    "news_item",
    "event_cluster",
    "market_price",
  ]);
  assert.deepEqual(plan.steps.map((step) => step.dataset), [
    "raw_document",
    "news_item",
    "event_cluster",
    "market_price",
  ]);
  assert.ok(plan.steps.every((step) => step.action === "retain_and_downsample_plan"));
  assert.ok(plan.steps.every((step) => step.cutoffIso < NOW));
  assert.match(plan.steps.find((step) => step.dataset === "market_price")?.description ?? "", /downsample/i);
});

test("market price downsampling preserves deterministic bucket representatives", () => {
  const points = selectMarketPriceDownsamplePoints([
    { marketId: "m1", ts: "2026-05-07T10:00:00.000Z", probability: 0.5, source: "polymarket-public" },
    { marketId: "m1", ts: "2026-05-07T10:15:00.000Z", probability: 0.52, source: "polymarket-public" },
    { marketId: "m1", ts: "2026-05-07T11:00:00.000Z", probability: 0.57, source: "polymarket-public" },
    { marketId: "m2", ts: "2026-05-07T10:05:00.000Z", probability: 0.31, source: "polymarket-public" },
  ], { bucketMinutes: 60 });

  assert.deepEqual(points.map((point) => `${point.marketId}:${point.ts}`), [
    "m1:2026-05-07T10:00:00.000Z",
    "m1:2026-05-07T11:00:00.000Z",
    "m2:2026-05-07T10:05:00.000Z",
  ]);
});

test("bridge retention command emits a dry-run plan", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/bridge.mjs",
    "bridge:retention:plan",
    "--now=2026-05-07T12:00:00.000Z",
  ]);
  const payload = JSON.parse(stdout) as {
    readOnly?: boolean;
    dryRun?: boolean;
    retentionPlan?: {
      readOnly?: boolean;
      dryRun?: boolean;
      steps?: Array<{ dataset?: string }>;
    };
  };

  assert.equal(payload.readOnly, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.retentionPlan?.readOnly, true);
  assert.equal(payload.retentionPlan?.dryRun, true);
  assert.ok(payload.retentionPlan?.steps?.some((step) => step.dataset === "market_price"));
});
