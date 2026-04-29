import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's strip-types test runner resolves the TS file directly.
import { marketFocusHref } from "../src/components/terminal/terminal-url.ts";

test("marketFocusHref preserves scanner params while focusing a market", () => {
  assert.equal(
    marketFocusHref("?lane=hot&limit=60", "2049264"),
    "/terminal?lane=hot&limit=60&marketId=2049264",
  );
});

test("marketFocusHref replaces an existing focused market id", () => {
  assert.equal(
    marketFocusHref("?lane=anomaly&marketId=540816", "2090768"),
    "/terminal?lane=anomaly&marketId=2090768",
  );
});

test("marketFocusHref strips autoExplain so focusing does not run catalyst", () => {
  assert.equal(
    marketFocusHref("?lane=hot&limit=60&autoExplain=1", "2049264"),
    "/terminal?lane=hot&limit=60&marketId=2049264",
  );
});
