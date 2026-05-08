import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionEventLifecycle,
  canTransitionMarketStatus,
  transitionEventLifecycle,
  transitionMarketStatus,
} from "../src/lib/terminal/state-machines.ts";

const NOW = "2026-05-07T12:00:00.000Z";

test("market status state machine allows only forward read-only transitions", () => {
  assert.equal(canTransitionMarketStatus("open", "paused"), true);
  assert.equal(canTransitionMarketStatus("paused", "open"), true);
  assert.equal(canTransitionMarketStatus("open", "closed"), true);
  assert.equal(canTransitionMarketStatus("closed", "resolved"), true);

  assert.equal(canTransitionMarketStatus("resolved", "open"), false);
  assert.equal(canTransitionMarketStatus("closed", "open"), false);

  assert.deepEqual(transitionMarketStatus("open", "closed", { at: NOW, reason: "close_time_elapsed" }), {
    accepted: true,
    from: "open",
    to: "closed",
    at: NOW,
    reason: "close_time_elapsed",
    ruleId: "market_state:open:closed",
  });
  assert.deepEqual(transitionMarketStatus("resolved", "open", { at: NOW, reason: "late_market_update" }), {
    accepted: false,
    from: "resolved",
    to: "open",
    at: NOW,
    reason: "late_market_update",
    ruleId: "market_state:invalid:resolved:open",
  });
});

test("event lifecycle state machine preserves terminal refutations", () => {
  assert.equal(canTransitionEventLifecycle("new", "developing"), true);
  assert.equal(canTransitionEventLifecycle("developing", "corroborated"), true);
  assert.equal(canTransitionEventLifecycle("corroborated", "contested"), true);
  assert.equal(canTransitionEventLifecycle("contested", "refuted"), true);

  assert.equal(canTransitionEventLifecycle("refuted", "corroborated"), false);
  assert.equal(canTransitionEventLifecycle("corroborated", "developing"), false);

  assert.deepEqual(transitionEventLifecycle("developing", "corroborated", { at: NOW, reason: "multi_source_confirmation" }), {
    accepted: true,
    from: "developing",
    to: "corroborated",
    at: NOW,
    reason: "multi_source_confirmation",
    ruleId: "event_lifecycle:developing:corroborated",
  });
  assert.deepEqual(transitionEventLifecycle("refuted", "developing", { at: NOW, reason: "new_social_claim" }), {
    accepted: false,
    from: "refuted",
    to: "developing",
    at: NOW,
    reason: "new_social_claim",
    ruleId: "event_lifecycle:invalid:refuted:developing",
  });
});
