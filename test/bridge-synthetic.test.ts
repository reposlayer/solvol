import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  TERMINAL_SYNTHETIC_SCENARIOS,
  buildTerminalSyntheticScenario,
} from "../src/lib/terminal/synthetic.ts";

const NOW = "2026-05-07T12:00:00.000Z";
const execFileAsync = promisify(execFile);

test("synthetic injection scenarios are deterministic and read-only", () => {
  assert.deepEqual(TERMINAL_SYNTHETIC_SCENARIOS, [
    "breaking-news-spike",
    "duplicate-burst",
    "source-outage",
    "rate-limit-incident",
    "price-move",
  ]);

  const first = buildTerminalSyntheticScenario({ scenario: "breaking-news-spike", now: NOW });
  const second = buildTerminalSyntheticScenario({ scenario: "breaking-news-spike", now: NOW });
  assert.deepEqual(second, first);
  assert.equal(first.readOnly, true);
  assert.equal(first.newsItems.length, 1);
  assert.equal(first.eventClusters.length, 1);
  assert.match(first.newsItems[0]?.provenance[0]?.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
});

test("synthetic scenarios cover dedupe, health incidents, and market moves", () => {
  const duplicate = buildTerminalSyntheticScenario({ scenario: "duplicate-burst", now: NOW });
  assert.equal(duplicate.rawItemsGenerated, 3);
  assert.equal(duplicate.newsItems.length, 1);
  assert.equal(duplicate.eventClusters[0]?.memberNewsItemIds?.length, 1);

  const outage = buildTerminalSyntheticScenario({ scenario: "source-outage", now: NOW });
  assert.equal(outage.sourceHealth[0]?.health, "failing");
  assert.match(outage.sourceHealth[0]?.lastError ?? "", /synthetic outage/i);

  const rateLimit = buildTerminalSyntheticScenario({ scenario: "rate-limit-incident", now: NOW });
  assert.equal(rateLimit.sourceHealth[0]?.health, "degraded");
  assert.equal(rateLimit.sourceHealth[0]?.lastHttpStatus, 429);
  assert.ok(rateLimit.sourceHealth[0]?.rateLimitResetAt);

  const priceMove = buildTerminalSyntheticScenario({ scenario: "price-move", now: NOW, marketId: "m-test" });
  assert.equal(priceMove.marketMoves.length, 1);
  assert.equal(priceMove.marketMoves[0]?.marketId, "m-test");
  assert.equal(priceMove.marketMoves[0]?.source, "polymarket-public");
});

test("bridge synthetic injection command emits a read-only scenario payload", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    "scripts/bridge.mjs",
    "bridge:inject:synthetic",
    "--scenario=price-move",
    "--market=m-cli",
    "--now=2026-05-07T12:00:00.000Z",
  ]);
  const payload = JSON.parse(stdout) as {
    readOnly?: boolean;
    dryRun?: boolean;
    syntheticScenario?: {
      readOnly?: boolean;
      scenario?: string;
      marketMoves?: Array<{ marketId?: string; source?: string }>;
    };
  };

  assert.equal(payload.readOnly, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.syntheticScenario?.readOnly, true);
  assert.equal(payload.syntheticScenario?.scenario, "price-move");
  assert.equal(payload.syntheticScenario?.marketMoves?.[0]?.marketId, "m-cli");
  assert.equal(payload.syntheticScenario?.marketMoves?.[0]?.source, "polymarket-public");
});
