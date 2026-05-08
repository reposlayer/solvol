import test from "node:test";
import assert from "node:assert/strict";
import { TERMINAL_REFRESH } from "../src/hooks/terminal-refresh.ts";

test("balanced live profile refreshes focused market data faster than discovery", () => {
  assert.equal(TERMINAL_REFRESH.discovery.refetchIntervalMs, 25_000);
  assert.equal(TERMINAL_REFRESH.discovery.staleTimeMs, 12_000);
  assert.equal(TERMINAL_REFRESH.snapshot.refetchIntervalMs, 12_000);
  assert.equal(TERMINAL_REFRESH.snapshot.staleTimeMs, 6_000);
  assert.equal(TERMINAL_REFRESH.intel.refetchIntervalMs, 15_000);
  assert.equal(TERMINAL_REFRESH.intel.staleTimeMs, 8_000);
});

test("source feed remains slower than CLOB-sensitive market data", () => {
  assert.ok(TERMINAL_REFRESH.feed.refetchIntervalMs > TERMINAL_REFRESH.intel.refetchIntervalMs);
  assert.ok(TERMINAL_REFRESH.feed.staleTimeMs > TERMINAL_REFRESH.intel.staleTimeMs);
});
