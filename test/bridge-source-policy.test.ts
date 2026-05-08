import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTerminalBridgeSourcePolicyCatalog,
} from "../src/lib/terminal/source-policy.ts";

test("source policy catalog classifies live, disabled, and review-gated sources", () => {
  const catalog = buildTerminalBridgeSourcePolicyCatalog({});

  assert.equal(catalog.readOnly, true);
  assert.equal(catalog.reviewComplete, false);
  assert.ok(catalog.missingInputs.includes("SOLVOL_SOURCE_POLICY_REVIEWED"));
  assert.ok(catalog.sources.length >= 10);

  const byId = new Map(catalog.sources.map((source) => [source.sourceId, source]));
  assert.equal(byId.get("polymarket-public")?.criticality, "core");
  assert.equal(byId.get("polymarket-public")?.clientExposureAllowed, true);
  assert.equal(byId.get("sec-rss")?.serverOnly, true);
  assert.equal(byId.get("sec-rss")?.policyNotes.some((note) => /User-Agent/i.test(note)), true);
  assert.equal(byId.get("reddit-oauth")?.enabledByDefault, false);
  assert.equal(byId.get("reddit-oauth")?.requiresDeletionHandling, true);
  assert.equal(byId.get("gnews-api")?.enabledByDefault, false);
  assert.equal(byId.get("mediastack-api")?.requiresCredential, true);
  assert.equal(byId.get("etherscan-indexed")?.correctnessCritical, false);
});

test("source policy catalog reports review readiness without enabling sources", () => {
  const ready = buildTerminalBridgeSourcePolicyCatalog({
    SOLVOL_SOURCE_POLICY_REVIEWED: "true",
  });

  assert.equal(ready.reviewComplete, true);
  assert.deepEqual(ready.missingInputs, []);
  assert.ok(ready.sources.every((source) => source.readOnly));
  assert.ok(ready.sources.some((source) => source.enabledByDefault === false));
});
