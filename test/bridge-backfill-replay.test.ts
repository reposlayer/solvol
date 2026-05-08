import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildTerminalBackfillPlan,
} from "../src/lib/terminal/backfill.ts";

const execFileAsync = promisify(execFile);

test("backfill planner emits read-only market and source plans", () => {
  const marketPlan = buildTerminalBackfillPlan({
    kind: "markets",
    now: "2026-05-07T12:00:00.000Z",
  });
  assert.equal(marketPlan.readOnly, true);
  assert.equal(marketPlan.kind, "markets");
  assert.equal(marketPlan.sourceId, "polymarket-public");
  assert.ok(marketPlan.steps.some((step) => step.includes("Gamma/CLOB/Data")));

  const sourcePlan = buildTerminalBackfillPlan({
    kind: "source",
    sourceId: "gdelt-doc",
    since: "2026-05-01",
    now: "2026-05-07T12:00:00.000Z",
  });
  assert.equal(sourcePlan.readOnly, true);
  assert.equal(sourcePlan.kind, "source");
  assert.equal(sourcePlan.sourceId, "gdelt-doc");
  assert.equal(sourcePlan.since, "2026-05-01");
  assert.ok(sourcePlan.steps.some((step) => step.includes("cursor")));
});

test("bridge backfill commands emit command-specific read-only plans", async () => {
  const markets = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/bridge.mjs",
    "bridge:backfill:markets",
    "--now=2026-05-07T12:00:00.000Z",
  ]);
  const marketPayload = JSON.parse(markets.stdout) as {
    backfillPlan?: { readOnly?: boolean; kind?: string; sourceId?: string };
  };
  assert.equal(marketPayload.backfillPlan?.readOnly, true);
  assert.equal(marketPayload.backfillPlan?.kind, "markets");
  assert.equal(marketPayload.backfillPlan?.sourceId, "polymarket-public");

  const source = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/bridge.mjs",
    "bridge:backfill:source",
    "--source=gdelt-doc",
    "--since=2026-05-01",
    "--now=2026-05-07T12:00:00.000Z",
  ]);
  const sourcePayload = JSON.parse(source.stdout) as {
    backfillPlan?: { readOnly?: boolean; kind?: string; sourceId?: string; since?: string };
  };
  assert.equal(sourcePayload.backfillPlan?.readOnly, true);
  assert.equal(sourcePayload.backfillPlan?.kind, "source");
  assert.equal(sourcePayload.backfillPlan?.sourceId, "gdelt-doc");
  assert.equal(sourcePayload.backfillPlan?.since, "2026-05-01");
});

test("bridge replay command reports missing raw blob keys without mutation", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/bridge.mjs",
    "bridge:replay",
    "--raw-blob-key=raw/missing/payload.json",
    "--now=2026-05-07T12:00:00.000Z",
  ]);
  const payload = JSON.parse(stdout) as {
    replayResult?: {
      readOnly?: boolean;
      requestedRawBlobKeys?: string[];
      missingRawBlobKeys?: string[];
    };
  };

  assert.equal(payload.replayResult?.readOnly, true);
  assert.deepEqual(payload.replayResult?.requestedRawBlobKeys, ["raw/missing/payload.json"]);
  assert.deepEqual(payload.replayResult?.missingRawBlobKeys, ["raw/missing/payload.json"]);
});
