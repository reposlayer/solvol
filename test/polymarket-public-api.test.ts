import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  POLYMARKET_PUBLIC_BASES,
  POLYMARKET_PUBLIC_ENDPOINTS,
  buildPublicPolymarketUrl,
  parsePublicMidpoint,
} from "../src/lib/polymarket/public-api.ts";
import {
  buildPolymarketMarketUrl,
  buildPolymarketSearchUrl,
} from "../src/lib/polymarket/links.ts";
import {
  fetchPolymarketMarketsWithFallback,
  normalizePolymarketMarket,
} from "../src/lib/polymarket/api.ts";

test("Polymarket public API manifest covers read-only Gamma, CLOB, and Data endpoints", () => {
  assert.deepEqual(POLYMARKET_PUBLIC_BASES, {
    gamma: "https://gamma-api.polymarket.com",
    clob: "https://clob.polymarket.com",
    data: "https://data-api.polymarket.com",
  });

  for (const endpoint of POLYMARKET_PUBLIC_ENDPOINTS) {
    assert.equal(endpoint.readOnly, true);
    assert.equal(endpoint.requiresAuth, false);
    assert.equal(endpoint.method, "GET");
    assert.doesNotMatch(endpoint.path, /order|cancel|deposit|withdraw|bridge|submit/i);
  }

  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "gamma" && endpoint.path === "/markets"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "gamma" && endpoint.path === "/markets/{id}"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "gamma" && endpoint.path === "/events"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "gamma" && endpoint.path === "/public-search"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "clob" && endpoint.path === "/book"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "clob" && endpoint.path === "/midpoint"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "clob" && endpoint.path === "/spread"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "clob" && endpoint.path === "/prices-history"));
  assert.ok(POLYMARKET_PUBLIC_ENDPOINTS.some((endpoint) => endpoint.api === "data" && endpoint.path === "/trades"));
});

test("public Polymarket URL builder rejects authenticated or mutating paths", () => {
  assert.equal(
    buildPublicPolymarketUrl("clob", "/midpoint", { token_id: "123" }),
    "https://clob.polymarket.com/midpoint?token_id=123",
  );
  assert.equal(
    buildPublicPolymarketUrl("gamma", "/markets/99"),
    "https://gamma-api.polymarket.com/markets/99",
  );
  assert.equal(
    buildPublicPolymarketUrl("gamma", "/events", { active: true, closed: false, limit: 100, offset: 50 }),
    "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset=50",
  );

  assert.throws(() => buildPublicPolymarketUrl("clob", "/order"), /not an allowed public read-only endpoint/);
  assert.throws(() => buildPublicPolymarketUrl("clob", "/cancel-all"), /not an allowed public read-only endpoint/);
  assert.throws(() => buildPublicPolymarketUrl("gamma", "/events/123/order"), /not an allowed public read-only endpoint/);
});

test("midpoint parser accepts the current public CLOB response shape and legacy shape", () => {
  assert.equal(parsePublicMidpoint({ mid_price: "0.45" }), 0.45);
  assert.equal(parsePublicMidpoint({ mid: "0.46" }), 0.46);
  assert.equal(parsePublicMidpoint({ mid_price: "not-a-number" }), null);
});

test("Polymarket frontend links use event slugs and safe search fallback", () => {
  assert.equal(
    buildPolymarketMarketUrl({
      eventSlug: "what-will-happen-before-gta-vi",
      question: "Russia-Ukraine Ceasefire before GTA VI?",
      marketSlug: "russia-ukraine-ceasefire-before-gta-vi-554",
      id: "540816",
    }),
    "https://polymarket.com/event/what-will-happen-before-gta-vi",
  );
  assert.equal(
    buildPolymarketMarketUrl({
      question: "Russia-Ukraine Ceasefire before GTA VI?",
      marketSlug: "russia-ukraine-ceasefire-before-gta-vi-554",
      id: "540816",
    }),
    buildPolymarketSearchUrl("Russia-Ukraine Ceasefire before GTA VI?"),
  );
});

test("live Gamma normalization does not borrow demo order-book depth", () => {
  const market = normalizePolymarketMarket({
    id: "live-1",
    question: "Will this live market stay live?",
    slug: "live-market",
    outcomePrices: "[\"0.71\",\"0.29\"]",
    volume24hr: 1200,
    liquidityNum: 3400,
    active: true,
    closed: false,
    endDate: "2026-06-01T00:00:00.000Z",
  });

  assert.deepEqual(market.orderBook, {
    yesBids: [],
    yesAsks: [],
    noBids: [],
    noAsks: [],
  });
});

test("empty live Gamma reads are labeled as mock fallback, not real", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  try {
    const payload = await fetchPolymarketMarketsWithFallback({ limit: 5 });

    assert.equal(payload.readOnly, true);
    assert.equal(payload.mode, "mock");
    assert.match(payload.error ?? "", /No live Polymarket markets/i);
    assert.ok(payload.markets.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("terminal public API routes label live payloads as real data explicitly", async () => {
  const discoveryRoute = await readFile("src/app/api/discovery/route.ts", "utf8");
  const marketRoute = await readFile("src/app/api/market/[id]/route.ts", "utf8");
  const intelRoute = await readFile("src/app/api/market/[id]/intel/route.ts", "utf8");

  for (const route of [discoveryRoute, marketRoute, intelRoute]) {
    assert.match(route, /dataMode:\s*"real"/);
    assert.match(route, /dataMode:\s*"mock"/);
  }
});

test("terminal Polymarket source uses the public manifest and exposes a read-only status API route", async () => {
  const source = await readFile("src/lib/terminal/polymarket-source.ts", "utf8");
  const client = await readFile("src/lib/polymarket/client.ts", "utf8");
  const discovery = await readFile("src/lib/polymarket/discovery.ts", "utf8");
  const momentum = await readFile("src/lib/polymarket/clob-momentum.ts", "utf8");
  const related = await readFile("src/lib/related/markets.ts", "utf8");
  const statusRoute = await readFile("src/app/api/polymarket/status/route.ts", "utf8");

  assert.match(source, /publicPolymarketStatusDescriptor/);
  assert.match(client, /buildPublicPolymarketUrl/);
  assert.match(client, /parsePublicMidpoint/);
  assert.match(discovery, /buildPublicPolymarketUrl/);
  assert.match(momentum, /buildPublicPolymarketUrl/);
  assert.match(related, /buildPublicPolymarketUrl/);
  assert.match(statusRoute, /POLYMARKET_PUBLIC_ENDPOINTS/);
  assert.match(statusRoute, /readOnly:\s*true/);

  for (const content of [source, client, discovery, momentum, related, statusRoute]) {
    assert.doesNotMatch(content, /POLY_API_KEY|POLY_SIGNATURE|POLY_PASSPHRASE|privateKey|createOrder|postOrder|cancelOrder/);
  }
});
