import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BRIDGE_FEATURE_FLAG_NAMES,
  bridgeCommandManifest,
  readBridgeFeatureFlags,
} from "../src/lib/terminal/bridge-control.ts";

test("bridge feature flags expose roadmap control-plane names", () => {
  for (const flag of [
    "bridge.cluster.v1",
    "bridge.correlation.whyMovedV1",
    "bridge.realtime.sse",
    "bridge.ui.provenancePanel",
    "bridge.social.lowTrustSources",
    "bridge.ingest.source.gdelt-doc",
    "bridge.ingest.source.sec-rss",
    "bridge.ingest.source.federal-reserve-rss",
    "bridge.ingest.source.usgs-earthquakes",
    "bridge.ingest.source.cisa-rss",
    "bridge.ingest.source.ethereum-json-rpc",
    "bridge.ingest.source.etherscan-indexed",
    "bridge.ingest.source.coingecko-context",
    "bridge.ingest.source.fema-ipaws-rss",
    "bridge.ingest.source.reddit-oauth",
    "bridge.ingest.source.mastodon-public",
    "bridge.ingest.source.gnews-api",
    "bridge.ingest.source.mediastack-api",
    "bridge.ingest.source.fact-check-overlays",
  ]) {
    assert.ok(BRIDGE_FEATURE_FLAG_NAMES.includes(flag), `missing flag ${flag}`);
  }

  const flags = readBridgeFeatureFlags({
    SOLVOL_FLAG_BRIDGE_CLUSTER_V1: "true",
    SOLVOL_FLAG_BRIDGE_CORRELATION_WHY_MOVED_V1: "true",
    SOLVOL_FLAG_BRIDGE_REALTIME_SSE: "false",
    SOLVOL_FLAG_BRIDGE_UI_PROVENANCE_PANEL: "1",
    SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES: "0",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GDELT_DOC: "true",
  }, ["gdelt-doc", "sec-rss"]);

  assert.equal(flags["bridge.cluster.v1"], true);
  assert.equal(flags["bridge.correlation.whyMovedV1"], true);
  assert.equal(flags["bridge.realtime.sse"], false);
  assert.equal(flags["bridge.ui.provenancePanel"], true);
  assert.equal(flags["bridge.social.lowTrustSources"], false);
  assert.equal(flags["bridge.ingest.source.gdelt-doc"], true);
  assert.equal(flags["bridge.ingest.source.sec-rss"], false);
});

test("bridge repo commands are documented, read-only, and npm-addressable", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as { scripts?: Record<string, string> };
  const envExample = await readFile(".env.example", "utf8");
  const cli = await readFile("scripts/bridge.mjs", "utf8");

  for (const command of [
    "bridge:health",
    "bridge:backfill:markets",
    "bridge:backfill:source",
    "bridge:replay",
    "bridge:inject:synthetic",
    "bridge:pause-source",
    "bridge:resume-source",
    "bridge:retention:plan",
    "bridge:audit",
    "bridge:canary:check",
    "bridge:canary:env-template",
  ]) {
    assert.ok(pkg.scripts?.[command]?.includes("scripts/bridge.mjs"), `missing script ${command}`);
  }

  assert.ok(bridgeCommandManifest.every((command) => command.readOnly));
  assert.ok(bridgeCommandManifest.some((command) => command.name === "bridge:inject:synthetic"));
  assert.ok(bridgeCommandManifest.some((command) => command.name === "bridge:retention:plan"));
  assert.ok(bridgeCommandManifest.some((command) => command.name === "bridge:audit"));
  assert.ok(bridgeCommandManifest.some((command) => command.name === "bridge:canary:check"));
  assert.ok(bridgeCommandManifest.some((command) => command.name === "bridge:canary:env-template"));
  assert.match(envExample, /SOLVOL_FLAG_BRIDGE_CLUSTER_V1/);
  assert.match(envExample, /SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GDELT_DOC/);
  assert.match(envExample, /SOLVOL_BRIDGE_REDIS_URL/);
  assert.match(envExample, /SOLVOL_BRIDGE_BROADCASTER_URL/);
  assert.match(envExample, /SOLVOL_ERROR_MONITORING_DSN/);
  assert.match(envExample, /SOLVOL_METRICS_DSN/);
  assert.doesNotMatch(cli, /createOrder|postOrder|cancelOrder|privateKey|deposit|withdraw|custody/i);
});
