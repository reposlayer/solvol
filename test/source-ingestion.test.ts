import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dedupeSourceDocuments, matchDocumentsToMarket, sourceDensityByMarket } from "../src/lib/context/source-documents.ts";
import { scoreSourceDocuments } from "../src/lib/catalyst/source-scoring.ts";
import {
  buildTerminalMarketsForIngest,
  buildIngestAuthResult,
  buildTerminalBridgeFeedConfig,
  normalizeIngestLimit,
} from "../src/lib/context/ingest.ts";
import type { Market, MarketSource } from "../src/lib/terminal/types.ts";

const baseDoc = {
  provider: "gdelt" as const,
  externalId: "https://example.com/a",
  title: "Fed rate cut odds rise",
  url: "https://example.com/a",
  publishedAt: "2026-05-01T10:00:00.000Z",
  retrievedAt: "2026-05-01T10:05:00.000Z",
  summary: "Federal Reserve officials discuss cuts.",
  category: "event_graph" as const,
  matchedTerms: ["Fed", "rate"],
  reliability: 0.8,
  metadata: { domain: "example.com" },
};

test("deduplicates source documents by provider and external id", () => {
  const docs = dedupeSourceDocuments([
    baseDoc,
    { ...baseDoc, title: "Later duplicate", matchedTerms: ["Fed", "FOMC"] },
    { ...baseDoc, provider: "rss", externalId: "rss:1" },
  ]);

  assert.equal(docs.length, 2);
  assert.equal(docs[0]?.title, "Fed rate cut odds rise");
  assert.deepEqual(docs[0]?.matchedTerms, ["Fed", "rate", "FOMC"]);
});

test("matches source documents to markets using market terms", () => {
  const matches = matchDocumentsToMarket(
    "123",
    ["Fed", "CPI"],
    [
      baseDoc,
      { ...baseDoc, externalId: "https://example.com/b", title: "Sports final", summary: "NBA result", matchedTerms: ["NBA"] },
    ],
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.marketId, "123");
  assert.equal(matches[0]?.relevanceScore, 2);
});

test("computes source density by market from matches", () => {
  const density = sourceDensityByMarket([
    { marketId: "1", provider: "rss", documentExternalId: "a", relevanceScore: 3 },
    { marketId: "1", provider: "gdelt", documentExternalId: "b", relevanceScore: 2 },
    { marketId: "2", provider: "rss", documentExternalId: "c", relevanceScore: 1 },
  ]);

  assert.equal(density.get("1"), 2);
  assert.equal(density.get("2"), 1);
});

test("scores mixed source documents as catalysts with provider-specific categories", () => {
  const catalysts = scoreSourceDocuments({
    marketId: "123",
    documents: [
      baseDoc,
      {
        provider: "wikidata",
        externalId: "Q306",
        title: "Donald Trump",
        url: "https://www.wikidata.org/wiki/Q306",
        publishedAt: null,
        retrievedAt: "2026-05-01T10:05:00.000Z",
        summary: "US president",
        category: "entity_context",
        matchedTerms: ["Trump"],
        reliability: 0.62,
        metadata: {},
      },
    ],
    move: {
      windowStart: "2026-05-01T09:00:00.000Z",
      windowEnd: "2026-05-01T11:00:00.000Z",
      priceBefore: 0.4,
      priceAfter: 0.48,
      movePercent: 20,
      baselineVolume24h: 1000,
      volumeInWindowEstimate: 1000,
      volumeMultiplierVs7dAvg: 2,
    },
    mainMoveSign: 1,
    volumeMultiplierVs7dAvg: 2,
    crossMarketSupport: 0.5,
  });

  assert.equal(catalysts.length, 2);
  assert.equal(catalysts[0]?.source, "event_graph");
  assert.equal(catalysts[1]?.source, "entity_context");
  assert.ok((catalysts[0]?.confidence ?? 0) > (catalysts[1]?.confidence ?? 0));
});

test("ingest route helpers enforce secret and clamp limits", () => {
  assert.equal(buildIngestAuthResult("Bearer one", "one", "two").ok, true);
  assert.equal(buildIngestAuthResult("Bearer two", "one", "two").ok, true);
  assert.equal(buildIngestAuthResult("Bearer nope", "one", "two").ok, false);
  assert.equal(normalizeIngestLimit("200"), 80);
  assert.equal(normalizeIngestLimit("bad"), 24);
});

test("terminal bridge live feed polling is server-side and opt-in", () => {
  assert.deepEqual(buildTerminalBridgeFeedConfig({}), {});
  assert.deepEqual(buildTerminalBridgeFeedConfig({
    SOLVOL_TERMINAL_FED_RSS_URL: " https://www.federalreserve.gov/feeds/press_monetary.xml ",
    SOLVOL_TERMINAL_GDELT_ENABLED: "true",
    SOLVOL_TERMINAL_GDELT_LIMIT: "12",
    SOLVOL_TERMINAL_USGS_URL: " https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson ",
    SOLVOL_TERMINAL_CISA_RSS_URL: " https://www.cisa.gov/cybersecurity-advisories/all.xml ",
    SOLVOL_TERMINAL_COINGECKO_ENABLED: "true",
    SOLVOL_TERMINAL_COINGECKO_IDS: " bitcoin, ethereum ",
    SOLVOL_TERMINAL_SEC_RSS_URL: " https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom ",
    SOLVOL_TERMINAL_SEC_USER_AGENT: " Solvol Terminal contact@example.com ",
    SOLVOL_TERMINAL_ETHEREUM_RPC_URL: " https://rpc.example ",
    SOLVOL_TERMINAL_ETHEREUM_CONTRACTS: " 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48, 0x1111111111111111111111111111111111111111 ",
    SOLVOL_TERMINAL_ETHEREUM_TOPICS: " 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef ",
    SOLVOL_TERMINAL_ETHERSCAN_API_KEY: " etherscan-key ",
    SOLVOL_TERMINAL_ETHERSCAN_CONTRACTS: " 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 ",
    SOLVOL_TERMINAL_ETHERSCAN_TOPICS: " 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef ",
    SOLVOL_TERMINAL_FEMA_IPAWS_URL: " https://www.fema.gov/api/open/v1/IpawsArchivedAlerts ",
    SOLVOL_TERMINAL_REDDIT_ACCESS_TOKEN: " reddit-token ",
    SOLVOL_TERMINAL_REDDIT_TERMS: " Federal Reserve, election ",
    SOLVOL_TERMINAL_MASTODON_INSTANCE_URL: " https://mastodon.social/ ",
    SOLVOL_TERMINAL_MASTODON_ACCESS_TOKEN: " mastodon-token ",
    SOLVOL_TERMINAL_MASTODON_TERMS: " Federal Reserve, election ",
    SOLVOL_TERMINAL_GNEWS_API_KEY: " gnews-key ",
    SOLVOL_TERMINAL_GNEWS_TERMS: " SpaceX, Starship ",
    SOLVOL_TERMINAL_GNEWS_LANGUAGE: " en ",
    SOLVOL_TERMINAL_MEDIASTACK_API_KEY: " mediastack-key ",
    SOLVOL_TERMINAL_MEDIASTACK_TERMS: " SpaceX, Starship ",
    SOLVOL_TERMINAL_MEDIASTACK_LANGUAGES: " en ",
    SOLVOL_TERMINAL_MEDIASTACK_COUNTRIES: " us ",
    SOLVOL_TERMINAL_FACT_CHECK_RSS_URL: " https://factcheck.example.org/rss.xml ",
    SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_CISA_RSS: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_COINGECKO_CONTEXT: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_ETHEREUM_JSON_RPC: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_ETHERSCAN_INDEXED: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_FACT_CHECK_OVERLAYS: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_FEDERAL_RESERVE_RSS: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_FEMA_IPAWS_RSS: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GDELT_DOC: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GNEWS_API: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_MASTODON_PUBLIC: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_MEDIASTACK_API: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_REDDIT_OAUTH: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_SEC_RSS: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_USGS_EARTHQUAKES: "true",
  }), {
    fedRssUrl: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    gdeltEnabled: true,
    gdeltLimit: 12,
    usgsFeedUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    cisaRssUrl: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    coinGeckoEnabled: true,
    coinGeckoIds: ["bitcoin", "ethereum"],
    secRssUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom",
    secUserAgent: "Solvol Terminal contact@example.com",
    ethereumRpcUrl: "https://rpc.example",
    ethereumAddresses: [
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "0x1111111111111111111111111111111111111111",
    ],
    ethereumTopics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
    etherscanApiKey: "etherscan-key",
    etherscanAddresses: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    etherscanTopics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
    femaIpawsUrl: "https://www.fema.gov/api/open/v1/IpawsArchivedAlerts",
    redditAccessToken: "reddit-token",
    redditTerms: ["Federal Reserve", "election"],
    mastodonInstanceUrl: "https://mastodon.social",
    mastodonAccessToken: "mastodon-token",
    mastodonTerms: ["Federal Reserve", "election"],
    gnewsApiKey: "gnews-key",
    gnewsTerms: ["SpaceX", "Starship"],
    gnewsLanguage: "en",
    mediastackApiKey: "mediastack-key",
    mediastackTerms: ["SpaceX", "Starship"],
    mediastackLanguages: "en",
    mediastackCountries: "us",
    factCheckRssUrl: "https://factcheck.example.org/rss.xml",
  });
});

test("terminal bridge source flags gate live feed config", () => {
  const env = {
    SOLVOL_TERMINAL_FED_RSS_URL: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    SOLVOL_TERMINAL_GNEWS_API_KEY: "gnews-key",
    SOLVOL_TERMINAL_GNEWS_TERMS: "SpaceX, Starship",
    SOLVOL_TERMINAL_REDDIT_ACCESS_TOKEN: "reddit-token",
    SOLVOL_TERMINAL_REDDIT_TERMS: "SpaceX, Starship",
  };

  assert.deepEqual(buildTerminalBridgeFeedConfig(env), {});
  assert.deepEqual(buildTerminalBridgeFeedConfig({
    ...env,
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_FEDERAL_RESERVE_RSS: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_GNEWS_API: "true",
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_REDDIT_OAUTH: "true",
  }), {
    fedRssUrl: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    gnewsApiKey: "gnews-key",
    gnewsTerms: ["SpaceX", "Starship"],
  });
  assert.deepEqual(buildTerminalBridgeFeedConfig({
    ...env,
    SOLVOL_FLAG_BRIDGE_INGEST_SOURCE_REDDIT_OAUTH: "true",
    SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES: "true",
  }), {
    redditAccessToken: "reddit-token",
    redditTerms: ["SpaceX", "Starship"],
  });
});

test("source ingest compiles market-led query packs before source collection", async () => {
  const ingest = await readFile("src/lib/context/ingest.ts", "utf8");

  assert.match(ingest, /compileMarketQueryPack/);
  assert.match(ingest, /queryPack\.gdeltTerms/);
  assert.match(ingest, /sourcePriorities/);
  assert.match(ingest, /createGNewsSourceAdapter/);
  assert.match(ingest, /createMediastackSourceAdapter/);
  assert.match(ingest, /createFactCheckSourceAdapter/);
});

test("source ingest resolves Polymarket terminal markets for scheduled bridge runs", async () => {
  const requested: string[] = [];
  const market = (id: string): Market => ({
    id,
    source: { id: "polymarket", label: "Polymarket", kind: "polymarket" },
    title: `Market ${id}`,
    category: "Macro",
    event: `Event ${id}`,
    url: `https://polymarket.com/event/${id}`,
    description: "Read-only fixture market.",
    resolutionRules: "Fixture rules.",
    outcomes: [
      { id: `${id}-yes`, label: "YES", probability: 0.55, price: 0.55 },
      { id: `${id}-no`, label: "NO", probability: 0.45, price: 0.45 },
    ],
    probability: 0.55,
    volume24h: 1000,
    volume7d: 5000,
    liquidity: 10000,
    openInterest: null,
    closeTime: null,
    createdAt: null,
    updatedAt: "2026-05-07T12:00:00.000Z",
    status: "open",
    priceHistory: [
      { timestamp: "2026-05-07T11:30:00.000Z", probability: 0.49 },
      { timestamp: "2026-05-07T12:00:00.000Z", probability: 0.55 },
    ],
  });
  const source: Pick<MarketSource, "getMarket"> = {
    async getMarket(marketId: string) {
      requested.push(marketId);
      return marketId === "missing" ? null : market(marketId);
    },
  };

  const markets = await buildTerminalMarketsForIngest([
    { marketId: "m-1" },
    { marketId: "m-2" },
    { marketId: "m-1" },
    { marketId: "missing" },
  ], source);
  const ingest = await readFile("src/lib/context/ingest.ts", "utf8");

  assert.deepEqual(requested, ["m-1", "m-2", "missing"]);
  assert.deepEqual(markets.map((item) => item.id), ["m-1", "m-2"]);
  assert.match(ingest, /createPolymarketMarketSource/);
  assert.match(ingest, /buildTerminalMarketsForIngest/);
  assert.match(ingest, /markets:\s*terminalMarkets/);
});
