import test from "node:test";
import assert from "node:assert/strict";
import { marketFocusHref } from "../src/components/terminal/terminal-url.ts";

test("marketFocusHref preserves scanner params while focusing a market", () => {
  assert.equal(
    marketFocusHref("?lane=hot&limit=60", "2049264"),
    "/terminal/market/2049264?lane=hot&limit=60",
  );
});

test("marketFocusHref replaces an existing focused market id", () => {
  assert.equal(
    marketFocusHref("?lane=anomaly&marketId=540816", "2090768"),
    "/terminal/market/2090768?lane=anomaly&limit=80",
  );
});

test("marketFocusHref strips autoExplain so focusing does not run catalyst", () => {
  assert.equal(
    marketFocusHref("?lane=hot&limit=60&autoExplain=1", "2049264"),
    "/terminal/market/2049264?lane=hot&limit=60",
  );
});
