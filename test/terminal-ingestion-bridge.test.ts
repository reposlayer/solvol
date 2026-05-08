import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type {
  DataSourceStatus,
  Market,
  MarketMove,
  SourceAdapter,
} from "../src/lib/terminal/types.ts";
import {
  DEFAULT_TERMINAL_SOURCE_REGISTRY,
  buildRawDocumentMetadata,
  buildSourceIdempotencyKey,
  createInMemorySourceStore,
  normalizeSourceUrl,
} from "../src/lib/terminal/source-registry.ts";
import { fetchTerminalSourceHealthSnapshot } from "../src/lib/terminal/source-health.ts";
import {
  createCisaSourceAdapter,
  createCoinGeckoSourceAdapter,
  createEtherscanSourceAdapter,
  createEthereumJsonRpcSourceAdapter,
  createFemaIpawsSourceAdapter,
  createFedRssSourceAdapter,
  createFactCheckSourceAdapter,
  createGdeltSourceAdapter,
  createGNewsSourceAdapter,
  createMastodonSourceAdapter,
  createMediastackSourceAdapter,
  createRedditSourceAdapter,
  createSecRssSourceAdapter,
  createUsgsSourceAdapter,
} from "../src/lib/terminal/source-adapters.ts";
import {
  buildNearDuplicateTextSignature,
  clusterNewsItems,
  dedupeNewsItems,
  explainWhyMoved,
  replayEventCluster,
} from "../src/lib/terminal/source-intelligence.ts";
import {
  detectPriceReactionWindows,
  marketToPriceRecords,
  marketToRegistryRecord,
  reconcileMarketRegistry,
} from "../src/lib/terminal/market-registry.ts";
import {
  buildIngestionBridgePersistenceRows,
  persistIngestionBridgeArtifacts,
} from "../src/lib/terminal/persistence.ts";
import {
  createInMemoryRawPayloadStore,
  createSupabaseRawPayloadStore,
  supabaseRawPayloadStoreConfigFromEnv,
} from "../src/lib/terminal/raw-store.ts";
import { replayRawPayloadsFromStore } from "../src/lib/terminal/replay.ts";
import {
  createSupabaseTerminalCursorStore,
  createInMemoryTerminalCursorStore,
  runTerminalIngestionBridge,
} from "../src/lib/terminal/ingestion-runner.ts";
import {
  buildTerminalDeadLetterEntries,
  computeTerminalBridgeMetrics,
} from "../src/lib/terminal/operations.ts";
import {
  fetchDeliveryOutboxEvents,
  formatSseEvent,
  publishDeliveryOutboxEvents,
  terminalOutboxConfigFromEnv,
} from "../src/lib/terminal/outbox.ts";

const NOW = "2026-05-07T12:00:00.000Z";

function countPersistenceRows(rows: ReturnType<typeof buildIngestionBridgePersistenceRows>) {
  return {
    sourceRegistry: rows.sourceRegistry.length,
    sourceCursor: rows.sourceCursor.length,
    rawDocument: rows.rawDocument.length,
    newsItem: rows.newsItem.length,
    eventCluster: rows.eventCluster.length,
    eventClusterMember: rows.eventClusterMember.length,
    marketRegistry: rows.marketRegistry.length,
    marketPrice: rows.marketPrice.length,
    whyMovedCandidate: rows.whyMovedCandidate.length,
    deliveryOutbox: rows.deliveryOutbox.length,
  };
}

test("source registry and raw document store produce immutable checksummed provenance", async () => {
  const registryIds = DEFAULT_TERMINAL_SOURCE_REGISTRY.map((source) => source.sourceId);

  assert.deepEqual(registryIds, [
    "polymarket-public",
    "gdelt-doc",
    "sec-rss",
    "federal-reserve-rss",
    "usgs-earthquakes",
    "cisa-rss",
    "ethereum-json-rpc",
    "etherscan-indexed",
    "coingecko-context",
    "fema-ipaws-rss",
    "reddit-oauth",
    "mastodon-public",
    "gnews-api",
    "mediastack-api",
    "fact-check-overlays",
  ]);
  assert.ok(
    DEFAULT_TERMINAL_SOURCE_REGISTRY
      .filter((source) => !["etherscan-indexed", "fema-ipaws-rss", "reddit-oauth", "mastodon-public", "gnews-api", "mediastack-api", "fact-check-overlays"].includes(source.sourceId))
      .every((source) => source.enabled),
  );
  assert.ok(
    DEFAULT_TERMINAL_SOURCE_REGISTRY
      .filter((source) => ["etherscan-indexed", "fema-ipaws-rss", "reddit-oauth", "mastodon-public", "gnews-api", "mediastack-api", "fact-check-overlays"].includes(source.sourceId))
      .every((source) => !source.enabled),
  );
  assert.ok(DEFAULT_TERMINAL_SOURCE_REGISTRY.every((source) => source.readOnly));

  const rawPayload = { url: "https://example.com/fed", title: "Fed statement" };
  const raw = buildRawDocumentMetadata({
    sourceId: "gdelt-doc",
    sourceClass: "news_api",
    externalId: "https://example.com/fed",
    fetchedAt: NOW,
    publishedAt: "2026-05-07T11:58:00.000Z",
    adapterVersion: "gdelt-doc@fixture-v1",
    rawPayload,
  });

  assert.equal(raw.sourceId, "gdelt-doc");
  assert.equal(raw.externalId, "https://example.com/fed");
  assert.match(raw.rawBlobKey, /^raw\/gdelt-doc\/2026-05-07\//);
  assert.match(raw.checksumSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    buildSourceIdempotencyKey({
      sourceId: raw.sourceId,
      externalId: raw.externalId,
      canonicalUrl: "https://example.com/fed?utm_source=x",
      headline: "Fed statement",
      observedAt: NOW,
      publishedAt: raw.publishedAt,
    }),
    buildSourceIdempotencyKey({
      sourceId: raw.sourceId,
      externalId: raw.externalId,
      canonicalUrl: "https://example.com/fed",
      headline: "Fed statement",
      observedAt: NOW,
      publishedAt: raw.publishedAt,
    }),
  );

  const store = createInMemorySourceStore(DEFAULT_TERMINAL_SOURCE_REGISTRY);
  store.putRawDocument(raw);
  assert.throws(() => store.putRawDocument(raw), /raw document already exists/);
  store.updateCursor("gdelt-doc", { sinceIso: NOW, etag: "abc" }, NOW);

  assert.equal(store.getRawDocument(raw.id)?.checksumSha256, raw.checksumSha256);
  assert.deepEqual(store.getCursor("gdelt-doc")?.cursor, { sinceIso: NOW, etag: "abc" });
});

test("terminal source urls only preserve http and https links", () => {
  assert.equal(normalizeSourceUrl("javascript:alert(1)"), undefined);
  assert.equal(normalizeSourceUrl("data:text/html;base64,PHNjcmlwdA=="), undefined);
  assert.equal(normalizeSourceUrl("notaurl"), undefined);
  assert.equal(
    normalizeSourceUrl("https://example.com/story/amp/?utm_source=feed#frag"),
    "https://example.com/story",
  );
});

test("Tier A fixture adapters normalize raw payloads into provenance-first NewsItem rows", async () => {
  const adapters = [
    createGdeltSourceAdapter([
      {
        url: "https://example.com/fed-cut",
        title: "Fed approves rate cut timeline",
        seendate: "20260507T115900Z",
        domain: "example.com",
        sourceCountry: "US",
        language: "English",
      },
    ], { now: NOW }),
    createSecRssSourceAdapter([
      {
        accessionNumber: "0000320193-26-000050",
        formType: "8-K",
        companyName: "Apple Inc.",
        cik: "0000320193",
        filingDate: "2026-05-07T11:00:00.000Z",
        linkToFilingDetails: "https://www.sec.gov/Archives/edgar/data/320193/filing.htm",
        description: "Material agreement approved by the board.",
      },
    ], { now: NOW }),
    createFedRssSourceAdapter([
      {
        id: "fed:release:2026-05-07",
        title: "Federal Reserve issues FOMC statement",
        link: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260507a.htm",
        published: "2026-05-07T10:30:00.000Z",
        summary: "The Committee voted to lower the target range.",
      },
    ], { now: NOW }),
    createUsgsSourceAdapter([
      {
        id: "usgs-us7000abcd",
        properties: {
          title: "M 6.4 - 10 km S of Hualien City, Taiwan",
          time: Date.parse("2026-05-07T09:45:00.000Z"),
          mag: 6.4,
          place: "10 km S of Hualien City, Taiwan",
          url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
        },
        geometry: { coordinates: [121.6, 23.9, 18] },
      },
    ], { now: NOW }),
    createCisaSourceAdapter([
      {
        id: "cisa:aa26-127a",
        title: "CISA releases emergency directive for exploited product",
        link: "https://www.cisa.gov/news-events/alerts/2026/05/07/emergency-directive",
        published: "2026-05-07T08:15:00.000Z",
        summary: "Federal agencies must mitigate active exploitation.",
      },
    ], { now: NOW }),
    createEthereumJsonRpcSourceAdapter([
      {
        blockNumber: 19_000_001,
        transactionHash: "0x123400000000000000000000000000000000000000000000000000000000abcd",
        logIndex: 7,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        eventName: "Transfer",
        blockTimestamp: "2026-05-07T11:54:00.000Z",
        summary: "Large USDC transfer observed on Ethereum mainnet.",
        topics: ["0xddf252ad"],
      },
    ], { now: NOW }),
    createCoinGeckoSourceAdapter([
      {
        id: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        marketData: {
          currentPriceUsd: 72500,
          priceChangePercentage24h: 4.2,
        },
        lastUpdated: "2026-05-07T11:55:00.000Z",
      },
    ], { now: NOW }),
  ] as const;

  const normalized = (await Promise.all(adapters.map(async (adapter) => adapter.normalize((await adapter.fetchBatch()).rawItems[0]!)))).flat();

  assert.equal(normalized.length, 7);
  assert.deepEqual(normalized.map((item) => item.sourceId), [
    "gdelt-doc",
    "sec-rss",
    "federal-reserve-rss",
    "usgs-earthquakes",
    "cisa-rss",
    "ethereum-json-rpc",
    "coingecko-context",
  ]);
  assert.ok(normalized.every((item) => item.provenance.length === 1));
  assert.ok(normalized.every((item) => item.provenance[0]!.checksumSha256.match(/^[a-f0-9]{64}$/)));
  assert.ok(normalized.every((item) => item.credibility.ruleIds.some((rule) => rule.startsWith("cred:base:"))));
  assert.ok(normalized.every((item) => item.sentiment.ruleIds.length > 0 || item.sentiment.label === "neutral"));
  assert.ok(normalized.some((item) => item.entities.some((entity) => entity.kind === "ticker" && entity.canonicalName === "AAPL")));
  assert.ok(normalized.some((item) => item.geo?.some((geo) => geo.countryCode === "TW")));
  assert.ok(normalized.some((item) => item.sourceClass === "onchain" && item.topics?.includes("Transfer")));
});

test("optional source fixture adapters normalize disabled registry entries when explicitly supplied", async () => {
  const adapters = [
    createFemaIpawsSourceAdapter([
      {
        identifier: "ipaws-1",
        sender: "nws@example.gov",
        sent: "2026-05-07T11:40:00.000Z",
        event: "Tornado Warning",
        headline: "Tornado Warning issued for Oklahoma County",
        description: "A tornado warning is active for Oklahoma County, Oklahoma.",
        instruction: "Take shelter now.",
        areaDesc: "Oklahoma County, OK",
        web: "https://www.fema.gov/ipaws/alert/ipaws-1",
      },
    ], { now: NOW }),
    createEtherscanSourceAdapter([
      {
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        blockNumber: "19000001",
        timeStamp: "1778154900",
        transactionHash: "0xetherscan0000000000000000000000000000000000000000000000000001",
        logIndex: "7",
        topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
        data: "0x",
      },
    ], { now: NOW }),
    createRedditSourceAdapter([
      {
        id: "abc123",
        name: "t3_abc123",
        title: "Federal Reserve rate cut discussion is accelerating",
        selftext: "Prediction market users are discussing a possible rate cut.",
        subreddit: "polymarket",
        author: "macro_user",
        permalink: "/r/polymarket/comments/abc123/fed_cut/",
        url: "https://www.reddit.com/r/polymarket/comments/abc123/fed_cut/",
        createdUtc: 1778154000,
        score: 42,
        numComments: 12,
      },
    ], { now: NOW }),
    createMastodonSourceAdapter([
      {
        id: "mastodon-1",
        url: "https://mastodon.social/@fedwatch/123",
        content: "<p>Federal Reserve rate cut odds are moving.</p>",
        account: {
          acct: "fedwatch@mastodon.social",
          displayName: "Fed Watch",
        },
        createdAt: "2026-05-07T11:50:00.000Z",
        language: "en",
        favouritesCount: 5,
        reblogsCount: 1,
      },
    ], { now: NOW }),
    createGNewsSourceAdapter([
      {
        title: "SpaceX Starship launch license receives FAA review",
        description: "FAA officials are reviewing SpaceX Starship launch approval before June 30.",
        content: "The Starship test flight timeline depends on launch license approval.",
        url: "https://example.com/starship-faa",
        publishedAt: "2026-05-07T11:35:00.000Z",
        source: {
          name: "Space News Wire",
          url: "https://example.com",
        },
      },
    ], { now: NOW }),
    createMediastackSourceAdapter([
      {
        title: "Starship test flight window remains under FAA scrutiny",
        description: "SpaceX is preparing for a Starship test flight while FAA approval is pending.",
        url: "https://example.org/starship-test-flight",
        source: "Example Space Desk",
        author: "Launch Reporter",
        publishedAt: "2026-05-07T11:36:00.000Z",
        category: "science",
        country: "us",
        language: "en",
      },
    ], { now: NOW }),
    createFactCheckSourceAdapter([
      {
        id: "factcheck-1",
        title: "Fact check: Starship launch license claim",
        link: "https://factcheck.example.org/starship-license-claim",
        published: "2026-05-07T11:37:00.000Z",
        summary: "Review of claims about FAA approval for a SpaceX Starship launch before June 30.",
      },
    ], { now: NOW }),
  ] as const;

  const normalizeFirst = async <R>(adapter: SourceAdapter<R>) => {
    const raw = (await adapter.fetchBatch()).rawItems[0];
    assert.ok(raw);
    return adapter.normalize(raw);
  };

  const normalized = (await Promise.all([
    normalizeFirst(adapters[0]),
    normalizeFirst(adapters[1]),
    normalizeFirst(adapters[2]),
    normalizeFirst(adapters[3]),
    normalizeFirst(adapters[4]),
    normalizeFirst(adapters[5]),
    normalizeFirst(adapters[6]),
  ])).flat();

  assert.deepEqual(normalized.map((item) => item.sourceId), [
    "fema-ipaws-rss",
    "etherscan-indexed",
    "reddit-oauth",
    "mastodon-public",
    "gnews-api",
    "mediastack-api",
    "fact-check-overlays",
  ]);
  assert.ok(normalized.every((item) => item.provenance[0]?.checksumSha256.match(/^[a-f0-9]{64}$/)));
  assert.ok(normalized.some((item) => item.sourceClass === "official" && item.geo?.some((geo) => geo.name.includes("Oklahoma"))));
  assert.ok(normalized.some((item) => item.sourceClass === "onchain" && item.topics?.includes("Transfer")));
  assert.ok(normalized.filter((item) => item.sourceClass === "social").every((item) => item.credibility.ruleIds.includes("cred:base:social")));
  assert.ok(normalized.some((item) => item.sourceId === "gnews-api" && item.publisherDomain === "example.com"));
  assert.ok(normalized.some((item) => item.sourceId === "mediastack-api" && item.author === "Launch Reporter"));
  assert.ok(normalized.some((item) => item.sourceClass === "factcheck" && item.credibility.ruleIds.includes("cred:base:factcheck")));
});

test("optional live adapters are opt-in, read-only, and cursor-aware", async () => {
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const etherscanRequests: Array<{ url: string; init: RequestInit }> = [];
  const etherscan = createEtherscanSourceAdapter([], {
    now: NOW,
    apiKey: "etherscan-key",
    addresses: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    topics: [transferTopic],
    fromBlock: 100,
    maxBlockRange: 5,
    request: async (url, init) => {
      etherscanRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            status: "1",
            message: "OK",
            result: [
              {
                address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                blockNumber: "101",
                timeStamp: "1778154900",
                transactionHash: "0xnew",
                logIndex: "0x7",
                topics: [transferTopic],
                data: "0x",
              },
            ],
          };
        },
      };
    },
  });
  const etherscanBatch = await etherscan.fetchBatch({ blockNumber: 100 });
  const etherscanUrl = new URL(etherscanRequests[0]!.url);

  assert.equal(etherscanUrl.origin + etherscanUrl.pathname, "https://api.etherscan.io/v2/api");
  assert.equal(etherscanUrl.searchParams.get("chainid"), "1");
  assert.equal(etherscanUrl.searchParams.get("module"), "logs");
  assert.equal(etherscanUrl.searchParams.get("action"), "getLogs");
  assert.equal(etherscanUrl.searchParams.get("fromBlock"), "101");
  assert.equal(etherscanUrl.searchParams.get("toBlock"), "105");
  assert.equal(etherscanUrl.searchParams.get("topic0"), transferTopic);
  assert.equal(etherscanUrl.searchParams.get("apikey"), "etherscan-key");
  assert.deepEqual(etherscanBatch.nextCursor, {
    after: "0xnew:7",
    blockNumber: 105,
    sinceIso: NOW,
  });

  const femaRequests: Array<{ url: string; init: RequestInit }> = [];
  const fema = createFemaIpawsSourceAdapter([], {
    now: NOW,
    endpointUrl: "https://www.fema.gov/api/open/v1/IpawsArchivedAlerts",
    request: async (url, init) => {
      femaRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            IpawsArchivedAlerts: [
              {
                identifier: "old-alert",
                sent: "2026-05-07T09:00:00.000Z",
                event: "Old Alert",
                headline: "Old alert",
              },
              {
                identifier: "new-alert",
                sent: "2026-05-07T10:30:00.000Z",
                event: "Flash Flood Warning",
                headline: "Flash Flood Warning for Travis County",
                areaDesc: "Travis County, TX",
              },
            ],
          };
        },
      };
    },
  });
  const femaBatch = await fema.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });
  const femaUrl = new URL(femaRequests[0]!.url);

  assert.equal(femaUrl.origin + femaUrl.pathname, "https://www.fema.gov/api/open/v1/IpawsArchivedAlerts");
  assert.equal(femaUrl.searchParams.get("$top"), "30");
  assert.deepEqual(femaBatch.rawItems.map((item) => item.identifier), ["new-alert"]);

  const redditRequests: Array<{ url: string; init: RequestInit }> = [];
  const reddit = createRedditSourceAdapter([], {
    now: NOW,
    accessToken: "reddit-token",
    queryTerms: ["Federal Reserve"],
    request: async (url, init) => {
      redditRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: {
              after: "t3_new",
              children: [
                {
                  kind: "t3",
                  data: {
                    id: "new",
                    name: "t3_new",
                    title: "Federal Reserve discussion",
                    selftext: "Rate cut odds",
                    subreddit: "polymarket",
                    author: "macro_user",
                    permalink: "/r/polymarket/comments/new/fed/",
                    created_utc: 1778154000,
                    score: 5,
                    num_comments: 2,
                  },
                },
              ],
            },
          };
        },
      };
    },
  });
  const redditBatch = await reddit.fetchBatch();
  const redditUrl = new URL(redditRequests[0]!.url);

  assert.equal(redditUrl.origin + redditUrl.pathname, "https://oauth.reddit.com/search");
  assert.equal(redditUrl.searchParams.get("q"), "Federal Reserve");
  assert.equal((redditRequests[0]!.init.headers as Record<string, string>).Authorization, "Bearer reddit-token");
  assert.deepEqual(redditBatch.nextCursor?.after, "t3_new");

  const mastodonRequests: Array<{ url: string; init: RequestInit }> = [];
  const mastodon = createMastodonSourceAdapter([], {
    now: NOW,
    accessToken: "mastodon-token",
    instanceUrl: "https://mastodon.social",
    queryTerms: ["Federal Reserve"],
    request: async (url, init) => {
      mastodonRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            statuses: [
              {
                id: "mastodon-new",
                url: "https://mastodon.social/@fedwatch/123",
                content: "<p>Federal Reserve odds are moving.</p>",
                account: { acct: "fedwatch@mastodon.social", display_name: "Fed Watch" },
                created_at: "2026-05-07T11:50:00.000Z",
                language: "en",
                favourites_count: 5,
                reblogs_count: 1,
              },
            ],
          };
        },
      };
    },
  });
  const mastodonBatch = await mastodon.fetchBatch({ after: "mastodon-old" });
  const mastodonUrl = new URL(mastodonRequests[0]!.url);

  assert.equal(mastodonUrl.origin + mastodonUrl.pathname, "https://mastodon.social/api/v2/search");
  assert.equal(mastodonUrl.searchParams.get("type"), "statuses");
  assert.equal(mastodonUrl.searchParams.get("min_id"), "mastodon-old");
  assert.equal((mastodonRequests[0]!.init.headers as Record<string, string>).Authorization, "Bearer mastodon-token");
  assert.deepEqual(mastodonBatch.nextCursor?.after, "mastodon-new");

  const gnewsRequests: Array<{ url: string; init: RequestInit }> = [];
  const gnews = createGNewsSourceAdapter([], {
    now: NOW,
    apiKey: "gnews-key",
    queryTerms: ["SpaceX", "Starship", "FAA"],
    limit: 2,
    request: async (url, init) => {
      gnewsRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            articles: [
              {
                title: "Old Starship item",
                description: "Older item should be skipped.",
                url: "https://example.com/old-starship",
                publishedAt: "2026-05-07T09:30:00.000Z",
                source: { name: "Old Source", url: "https://example.com" },
              },
              {
                title: "SpaceX Starship FAA launch approval advances",
                description: "FAA review of the Starship launch license advanced.",
                url: "https://example.com/starship-faa",
                publishedAt: "2026-05-07T10:30:00.000Z",
                source: { name: "Space News Wire", url: "https://example.com" },
              },
            ],
          };
        },
      };
    },
  });
  const gnewsBatch = await gnews.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });
  const gnewsUrl = new URL(gnewsRequests[0]!.url);

  assert.equal(gnewsUrl.origin + gnewsUrl.pathname, "https://gnews.io/api/v4/search");
  assert.equal(gnewsUrl.searchParams.get("q"), "SpaceX OR Starship OR FAA");
  assert.equal(gnewsUrl.searchParams.get("max"), "2");
  assert.equal(gnewsUrl.searchParams.get("apikey"), "gnews-key");
  assert.equal(gnewsUrl.searchParams.get("from"), "2026-05-07T10:00:00.000Z");
  assert.deepEqual(gnewsBatch.rawItems.map((item) => item.url), ["https://example.com/starship-faa"]);
  assert.deepEqual(gnewsBatch.nextCursor, {
    after: "https://example.com/starship-faa",
    sinceIso: NOW,
  });

  const mediastackRequests: Array<{ url: string; init: RequestInit }> = [];
  const mediastack = createMediastackSourceAdapter([], {
    now: NOW,
    apiKey: "mediastack-key",
    queryTerms: ["SpaceX", "Starship"],
    limit: 2,
    request: async (url, init) => {
      mediastackRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: [
              {
                title: "Old mediastack Starship item",
                description: "Older item should be skipped.",
                url: "https://example.org/old-starship",
                source: "Example Space Desk",
                published_at: "2026-05-07T09:30:00.000Z",
              },
              {
                title: "Starship test flight awaits FAA license",
                description: "SpaceX Starship test flight timing depends on FAA licensing.",
                url: "https://example.org/starship-test-flight",
                source: "Example Space Desk",
                author: "Launch Reporter",
                published_at: "2026-05-07T10:45:00.000Z",
                category: "science",
                country: "us",
                language: "en",
              },
            ],
          };
        },
      };
    },
  });
  const mediastackBatch = await mediastack.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });
  const mediastackUrl = new URL(mediastackRequests[0]!.url);

  assert.equal(mediastackUrl.origin + mediastackUrl.pathname, "https://api.mediastack.com/v1/news");
  assert.equal(mediastackUrl.searchParams.get("keywords"), "SpaceX,Starship");
  assert.equal(mediastackUrl.searchParams.get("limit"), "2");
  assert.equal(mediastackUrl.searchParams.get("access_key"), "mediastack-key");
  assert.equal(mediastackUrl.searchParams.get("date"), "2026-05-07,2026-05-07");
  assert.deepEqual(mediastackBatch.rawItems.map((item) => item.url), ["https://example.org/starship-test-flight"]);
  assert.deepEqual(mediastackBatch.nextCursor, {
    after: "https://example.org/starship-test-flight",
    sinceIso: NOW,
  });

  const factCheck = createFactCheckSourceAdapter([], {
    now: NOW,
    feedUrl: "https://factcheck.example.org/rss.xml",
    parser: {
      async parseURL(url: string) {
        assert.equal(url, "https://factcheck.example.org/rss.xml");
        return {
          items: [
            {
              guid: "fact-old",
              title: "Old fact-check item",
              link: "https://factcheck.example.org/old",
              isoDate: "2026-05-07T09:30:00.000Z",
              contentSnippet: "Older item should be skipped.",
            },
            {
              guid: "fact-new",
              title: "Fact check: Starship launch license claim",
              link: "https://factcheck.example.org/starship-license",
              isoDate: "2026-05-07T10:50:00.000Z",
              contentSnippet: "Review of claims about FAA approval.",
            },
          ],
        };
      },
    },
  });
  const factCheckBatch = await factCheck.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });

  assert.deepEqual(factCheckBatch.rawItems.map((item) => item.id), ["fact-new"]);
  assert.deepEqual(factCheckBatch.nextCursor, {
    after: "fact-new",
    sinceIso: NOW,
  });
  assert.equal((await factCheck.normalize(factCheckBatch.rawItems[0]!))[0]?.sourceClass, "factcheck");
});

test("Federal Reserve RSS adapter polls the official monetary-policy feed with cursor filtering", async () => {
  const adapter = createFedRssSourceAdapter([], {
    now: NOW,
    feedUrl: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    parser: {
      async parseURL(url: string) {
        assert.equal(url, "https://www.federalreserve.gov/feeds/press_monetary.xml");
        return {
          items: [
            {
              guid: "fed-old",
              title: "Older Federal Reserve item",
              link: "https://www.federalreserve.gov/old.htm",
              isoDate: "2026-05-07T09:00:00.000Z",
              contentSnippet: "Older item should be skipped by cursor.",
            },
            {
              guid: "fed-new",
              title: "Federal Reserve issues FOMC statement",
              link: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260507a.htm",
              isoDate: "2026-05-07T10:30:00.000Z",
              contentSnippet: "The Committee voted to lower the target range.",
            },
          ],
        };
      },
    },
  });

  const batch = await adapter.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });
  const news = (await Promise.all(batch.rawItems.map((raw) => adapter.normalize(raw)))).flat();

  assert.equal(batch.rawItems.length, 1);
  assert.deepEqual(batch.nextCursor, {
    after: "fed-new",
    sinceIso: NOW,
  });
  assert.equal(news.length, 1);
  assert.equal(news[0]?.sourceId, "federal-reserve-rss");
  assert.equal(news[0]?.sourceClass, "official");
  assert.equal(news[0]?.canonicalUrl, "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260507a.htm");
  assert.equal(news[0]?.publishedAt, "2026-05-07T10:30:00.000Z");
  assert.ok(news[0]?.provenance[0]?.adapterVersion.includes("federal-reserve-rss"));
});

test("SEC RSS adapter polls configured EDGAR feed with fair-access user agent and cursor filtering", async () => {
  const adapter = createSecRssSourceAdapter([], {
    now: NOW,
    feedUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom",
    userAgent: "Solvol Terminal contact@example.com",
    parser: {
      async parseURL(url: string) {
        assert.equal(url, "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom");
        return {
          items: [
            {
              guid: "urn:tag:sec.gov,2008:accession-number=0000320193-26-000040",
              title: "8-K - Apple Inc. (0000320193) (Filer)",
              link: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000040/0000320193-26-000040-index.htm",
              isoDate: "2026-05-07T09:30:00.000Z",
              contentSnippet: "Filed: 2026-05-07 AccNo: 0000320193-26-000040 Size: 12 KB",
            },
            {
              guid: "urn:tag:sec.gov,2008:accession-number=0000320193-26-000050",
              title: "8-K - Apple Inc. (0000320193) (Filer)",
              link: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000050/0000320193-26-000050-index.htm",
              isoDate: "2026-05-07T10:30:00.000Z",
              contentSnippet: "Filed: 2026-05-07 AccNo: 0000320193-26-000050 Size: 14 KB",
            },
          ],
        };
      },
    },
  });

  const batch = await adapter.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });
  const normalized = await adapter.normalize(batch.rawItems[0]!);

  assert.deepEqual(batch.rawItems.map((item) => item.accessionNumber), ["0000320193-26-000050"]);
  assert.deepEqual(batch.nextCursor, {
    after: "0000320193-26-000050",
    sinceIso: NOW,
  });
  assert.equal(batch.sourceStatus.itemsFetchedLastRun, 1);
  assert.equal(batch.sourceStatus.lastCursor, "Solvol Terminal contact@example.com");
  assert.equal(normalized[0]?.sourceId, "sec-rss");
  assert.equal(normalized[0]?.headline, "Apple Inc. files 8-K with SEC");
  assert.equal(normalized[0]?.publishedAt, "2026-05-07T10:30:00.000Z");
  assert.equal(normalized[0]?.provenance[0]?.externalId, "0000320193-26-000050");
});

test("GDELT DOC adapter polls the live artlist endpoint with market terms and cursor filtering", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const adapter = createGdeltSourceAdapter([], {
    now: NOW,
    queryTerms: ["Federal Reserve", "rate cut", "FOMC"],
    limit: 2,
    request: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            articles: [
              {
                url: "https://example.com/old-fed",
                title: "Old Fed article",
                seendate: "20260507T095900Z",
                domain: "example.com",
                sourceCountry: "US",
                language: "English",
              },
              {
                url: "https://example.com/fed-cut",
                title: "Fed rate cut odds rise",
                seendate: "20260507T103000Z",
                domain: "example.com",
                sourceCountry: "US",
                language: "English",
              },
              {
                url: "https://example.com/fomc",
                title: "FOMC policy path update",
                seendate: "20260507T110000Z",
                domain: "example.com",
                sourceCountry: "US",
                language: "English",
              },
            ],
          };
        },
      };
    },
  });

  const batch = await adapter.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });

  assert.equal(requests.length, 1);
  const requestedUrl = new URL(requests[0]!.url);
  assert.equal(requestedUrl.origin + requestedUrl.pathname, "https://api.gdeltproject.org/api/v2/doc/doc");
  assert.equal(requestedUrl.searchParams.get("mode"), "artlist");
  assert.equal(requestedUrl.searchParams.get("format"), "json");
  assert.equal(requestedUrl.searchParams.get("sort"), "datedesc");
  assert.equal(requestedUrl.searchParams.get("maxrecords"), "2");
  assert.equal(requestedUrl.searchParams.get("startdatetime"), "20260507100000");
  assert.equal(requestedUrl.searchParams.get("enddatetime"), "20260507120000");
  assert.equal(requestedUrl.searchParams.get("query"), '("Federal Reserve" OR "rate cut" OR FOMC)');
  const headers = requests[0]!.init.headers as Record<string, string>;
  assert.match(headers["User-Agent"] ?? "", /SolvolTerminalBot/);
  assert.deepEqual(batch.rawItems.map((item) => item.url), [
    "https://example.com/fed-cut",
    "https://example.com/fomc",
  ]);
  assert.deepEqual(batch.nextCursor, {
    after: "https://example.com/fomc",
    sinceIso: NOW,
  });
  assert.equal(batch.sourceStatus.itemsFetchedLastRun, 2);

  const normalized = await adapter.normalize(batch.rawItems[0]!);
  assert.equal(normalized[0]?.sourceId, "gdelt-doc");
  assert.equal(normalized[0]?.headline, "Fed rate cut odds rise");
  assert.equal(normalized[0]?.provenance[0]?.externalId, "https://example.com/fed-cut");
});

test("USGS adapter polls the official GeoJSON feed with update cursor filtering", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const adapter = createUsgsSourceAdapter([], {
    now: NOW,
    feedUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    limit: 1,
    request: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            type: "FeatureCollection",
            features: [
              {
                id: "usgs-old",
                properties: {
                  title: "M 4.0 - old event",
                  time: Date.parse("2026-05-07T09:30:00.000Z"),
                  updated: Date.parse("2026-05-07T09:45:00.000Z"),
                  mag: 4,
                  place: "Old place",
                  url: "https://earthquake.usgs.gov/earthquakes/eventpage/usgs-old",
                },
                geometry: { coordinates: [-121.2, 37.2, 7] },
              },
              {
                id: "usgs-new",
                properties: {
                  title: "M 6.1 - 20 km S of Hualien City, Taiwan",
                  time: Date.parse("2026-05-07T10:20:00.000Z"),
                  updated: Date.parse("2026-05-07T10:25:00.000Z"),
                  mag: 6.1,
                  place: "20 km S of Hualien City, Taiwan",
                  url: "https://earthquake.usgs.gov/earthquakes/eventpage/usgs-new",
                },
                geometry: { coordinates: [121.6, 23.8, 18] },
              },
            ],
          };
        },
      };
    },
  });

  const batch = await adapter.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson");
  const headers = requests[0]!.init.headers as Record<string, string>;
  assert.match(headers["User-Agent"] ?? "", /SolvolTerminalBot/);
  assert.deepEqual(batch.rawItems.map((item) => item.id), ["usgs-new"]);
  assert.deepEqual(batch.nextCursor, {
    after: "usgs-new",
    sinceIso: NOW,
  });
  assert.equal(batch.sourceStatus.itemsFetchedLastRun, 1);

  const normalized = await adapter.normalize(batch.rawItems[0]!);
  assert.equal(normalized[0]?.sourceId, "usgs-earthquakes");
  assert.equal(normalized[0]?.occurredAt, "2026-05-07T10:20:00.000Z");
  assert.ok(normalized[0]?.geo?.some((geo) => geo.countryCode === "TW"));
  assert.equal(normalized[0]?.provenance[0]?.externalId, "usgs-new");
});

test("CISA RSS adapter polls the configured official feed with cursor filtering", async () => {
  const adapter = createCisaSourceAdapter([], {
    now: NOW,
    feedUrl: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    parser: {
      async parseURL(url: string) {
        assert.equal(url, "https://www.cisa.gov/cybersecurity-advisories/all.xml");
        return {
          items: [
            {
              guid: "cisa-old",
              title: "Older CISA advisory",
              link: "https://www.cisa.gov/news-events/alerts/2026/05/07/old",
              isoDate: "2026-05-07T09:00:00.000Z",
              contentSnippet: "Older advisory should be skipped.",
            },
            {
              guid: "cisa-new",
              title: "CISA releases advisory for exploited vulnerability",
              link: "https://www.cisa.gov/news-events/alerts/2026/05/07/exploited-vulnerability",
              isoDate: "2026-05-07T10:45:00.000Z",
              contentSnippet: "CISA urges mitigations for active exploitation.",
            },
          ],
        };
      },
    },
  });

  const batch = await adapter.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });
  const normalized = await adapter.normalize(batch.rawItems[0]!);

  assert.deepEqual(batch.rawItems.map((item) => item.id), ["cisa-new"]);
  assert.deepEqual(batch.nextCursor, {
    after: "cisa-new",
    sinceIso: NOW,
  });
  assert.equal(batch.sourceStatus.itemsFetchedLastRun, 1);
  assert.equal(normalized[0]?.sourceId, "cisa-rss");
  assert.equal(normalized[0]?.sourceClass, "official");
  assert.equal(normalized[0]?.publishedAt, "2026-05-07T10:45:00.000Z");
  assert.equal(normalized[0]?.provenance[0]?.externalId, "cisa-new");
});

test("Ethereum JSON-RPC adapter polls read-only logs with block cursor filtering", async () => {
  const requests: Array<{ url: string; body: { method?: string; params?: unknown[] }; init: RequestInit }> = [];
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const adapter = createEthereumJsonRpcSourceAdapter([], {
    now: NOW,
    endpointUrl: "https://rpc.example",
    addresses: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    topics: [transferTopic],
    maxBlockRange: 3,
    request: async (url, init) => {
      const body = JSON.parse(String(init.body)) as { method?: string; params?: unknown[] };
      requests.push({ url, body, init });
      if (body.method === "eth_blockNumber") {
        return {
          ok: true,
          status: 200,
          async json() {
            return { jsonrpc: "2.0", id: 1, result: "0x69" };
          },
        };
      }
      if (body.method === "eth_getLogs") {
        assert.deepEqual(body.params?.[0], {
          fromBlock: "0x65",
          toBlock: "0x67",
          address: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
          topics: [transferTopic],
        });
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              jsonrpc: "2.0",
              id: 2,
              result: [
                {
                  blockNumber: "0x64",
                  transactionHash: "0xold",
                  logIndex: "0x0",
                  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                  topics: [transferTopic],
                  data: "0x",
                },
                {
                  blockNumber: "0x65",
                  transactionHash: "0x123400000000000000000000000000000000000000000000000000000000abcd",
                  logIndex: "0x7",
                  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                  topics: [transferTopic],
                  data: "0x000000000000000000000000000000000000000000000000000000000f4240",
                },
              ],
            };
          },
        };
      }
      if (body.method === "eth_getBlockByNumber") {
        assert.deepEqual(body.params, ["0x65", false]);
        return {
          ok: true,
          status: 200,
          async json() {
            return { jsonrpc: "2.0", id: 3, result: { number: "0x65", timestamp: "0x681c3ab8" } };
          },
        };
      }
      throw new Error(`unexpected JSON-RPC method ${body.method}`);
    },
  });

  const batch = await adapter.fetchBatch({ blockNumber: 100, sinceIso: "2026-05-07T10:00:00.000Z" });
  const normalized = await adapter.normalize(batch.rawItems[0]!);

  assert.deepEqual(requests.map((request) => request.body.method), [
    "eth_blockNumber",
    "eth_getLogs",
    "eth_getBlockByNumber",
  ]);
  assert.ok(requests.every((request) => request.url === "https://rpc.example"));
  assert.ok(requests.every((request) => request.init.method === "POST"));
  assert.ok(requests.every((request) => !String(request.init.body).includes("eth_send")));
  assert.deepEqual(batch.rawItems.map((item) => item.transactionHash), [
    "0x123400000000000000000000000000000000000000000000000000000000abcd",
  ]);
  assert.deepEqual(batch.nextCursor, {
    after: "0x123400000000000000000000000000000000000000000000000000000000abcd:7",
    blockNumber: 103,
    sinceIso: NOW,
  });
  assert.equal(batch.sourceStatus.itemsFetchedLastRun, 1);
  assert.equal(batch.sourceStatus.lastHttpStatus, 200);
  assert.equal(batch.rawItems[0]?.blockTimestamp, "2025-05-08T05:01:44.000Z");
  assert.equal(normalized[0]?.sourceId, "ethereum-json-rpc");
  assert.equal(normalized[0]?.sourceClass, "onchain");
  assert.equal(normalized[0]?.headline, "Ethereum Transfer observed");
  assert.equal(normalized[0]?.publishedAt, "2025-05-08T05:01:44.000Z");
  assert.equal(normalized[0]?.provenance[0]?.externalId, "0x123400000000000000000000000000000000000000000000000000000000abcd:7");
});

test("CoinGecko adapter polls public market data for configured coin IDs with cursor filtering", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const adapter = createCoinGeckoSourceAdapter([], {
    now: NOW,
    coinIds: ["bitcoin", "ethereum"],
    request: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "bitcoin",
              symbol: "btc",
              name: "Bitcoin",
              current_price: 72500,
              price_change_percentage_24h: 4.2,
              last_updated: "2026-05-07T11:55:00.000Z",
            },
            {
              id: "ethereum",
              symbol: "eth",
              name: "Ethereum",
              current_price: 3800,
              price_change_percentage_24h: 1.5,
              last_updated: "2026-05-07T09:55:00.000Z",
            },
          ];
        },
      };
    },
  });

  const batch = await adapter.fetchBatch({ sinceIso: "2026-05-07T10:00:00.000Z" });

  assert.equal(requests.length, 1);
  const requestedUrl = new URL(requests[0]!.url);
  assert.equal(requestedUrl.origin + requestedUrl.pathname, "https://api.coingecko.com/api/v3/coins/markets");
  assert.equal(requestedUrl.searchParams.get("vs_currency"), "usd");
  assert.equal(requestedUrl.searchParams.get("ids"), "bitcoin,ethereum");
  assert.equal(requestedUrl.searchParams.get("order"), "market_cap_desc");
  assert.equal(requestedUrl.searchParams.get("per_page"), "2");
  assert.equal(requestedUrl.searchParams.get("page"), "1");
  assert.equal(requestedUrl.searchParams.get("sparkline"), "false");
  assert.equal(requestedUrl.searchParams.get("price_change_percentage"), "1h,24h,7d");
  const headers = requests[0]!.init.headers as Record<string, string>;
  assert.match(headers["User-Agent"] ?? "", /SolvolTerminalBot/);
  assert.deepEqual(batch.rawItems.map((item) => item.id), ["bitcoin"]);
  assert.deepEqual(batch.nextCursor, {
    after: "bitcoin",
    sinceIso: NOW,
  });
  assert.equal(batch.sourceStatus.itemsFetchedLastRun, 1);

  const normalized = await adapter.normalize(batch.rawItems[0]!);
  assert.equal(normalized[0]?.sourceId, "coingecko-context");
  assert.equal(normalized[0]?.headline, "Bitcoin market context");
  assert.equal(normalized[0]?.publishedAt, "2026-05-07T11:55:00.000Z");
  assert.equal(normalized[0]?.provenance[0]?.externalId, "bitcoin");
});

test("Reddit adapter tombstones deleted or removed submissions without evidence rows", async () => {
  const reddit = createRedditSourceAdapter([], {
    now: NOW,
    accessToken: "reddit-token",
    queryTerms: ["Federal Reserve"],
    request: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            after: "t3_visible",
            children: [
              {
                kind: "t3",
                data: {
                  id: "removed",
                  name: "t3_removed",
                  title: "[removed]",
                  selftext: "[deleted]",
                  subreddit: "polymarket",
                  author: "[deleted]",
                  permalink: "/r/polymarket/comments/removed/fed/",
                  removed_by_category: "moderator",
                  created_utc: 1778153900,
                },
              },
              {
                kind: "t3",
                data: {
                  id: "visible",
                  name: "t3_visible",
                  title: "Federal Reserve discussion remains visible",
                  selftext: "Rate cut odds are still being debated.",
                  subreddit: "polymarket",
                  author: "macro_user",
                  permalink: "/r/polymarket/comments/visible/fed/",
                  created_utc: 1778154000,
                },
              },
            ],
          },
        };
      },
    }),
  });

  const batch = await reddit.fetchBatch();
  const normalized = (await Promise.all(batch.rawItems.map((raw) => reddit.normalize(raw)))).flat();

  assert.deepEqual(batch.rawItems.map((raw) => raw.name), ["t3_removed", "t3_visible"]);
  assert.equal(batch.nextCursor?.after, "t3_visible");
  assert.deepEqual(normalized.map((item) => item.externalId), ["t3_visible"]);
  assert.doesNotMatch(JSON.stringify(normalized), /removed|deleted/i);
});

test("dedupe and clustering replay EventItem output from normalized NewsItem members", async () => {
  const adapter = createGdeltSourceAdapter([
    {
      url: "https://example.com/fed-decision?utm_source=gdelt",
      title: "Fed approves rate cut timeline",
      seendate: "20260507T115900Z",
      domain: "example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Federal Reserve officials approved a rate cut timeline.",
    },
    {
      url: "https://example.com/fed-decision?utm_medium=referral",
      title: "Fed approves rate cut timeline",
      seendate: "20260507T120100Z",
      domain: "example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Federal Reserve officials approved a rate cut timeline.",
    },
    {
      url: "https://example.com/usgs-quake",
      title: "USGS reports M 6.4 Taiwan earthquake",
      seendate: "20260507T094500Z",
      domain: "example.com",
      sourceCountry: "US",
      language: "English",
      summary: "The earthquake was detected near Hualien City.",
    },
  ], { now: NOW });

  const raw = await adapter.fetchBatch();
  const news = (await Promise.all(raw.rawItems.map((item) => adapter.normalize(item)))).flat();
  const deduped = dedupeNewsItems(news);
  const clusters = clusterNewsItems(deduped, { now: NOW });
  const replayed = replayEventCluster(clusters[0]!, deduped);

  assert.equal(news.length, 3);
  assert.equal(deduped.length, 2);
  assert.equal(clusters.length, 2);
  assert.equal(replayed.id, clusters[0]!.id);
  assert.equal(replayed.clusterKey, clusters[0]!.clusterKey);
  assert.deepEqual(replayed.memberNewsItemIds, clusters[0]!.memberNewsItemIds);
  assert.ok((replayed.provenance ?? []).length >= 1);
});

test("near-duplicate clustering uses deterministic simhash and minhash signatures", async () => {
  const adapter = createGdeltSourceAdapter([
    {
      url: "https://source-a.example.com/fed-path",
      title: "Federal Reserve approves rate cut timeline",
      seendate: "20260507T115900Z",
      domain: "source-a.example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Officials approved a timeline for lowering rates this summer.",
    },
    {
      url: "https://source-b.example.com/fed-timetable",
      title: "Fed approves rate-cut timetable, officials say",
      seendate: "20260507T120100Z",
      domain: "source-b.example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Federal Reserve officials approved a timetable to lower rates.",
    },
  ], { now: NOW });
  const raw = await adapter.fetchBatch();
  const news = (await Promise.all(raw.rawItems.map((item) => adapter.normalize(item)))).flat();
  const exactKeys = new Set(news.map((item) => item.dedupeFingerprint));
  const signatures = news.map((item) => buildNearDuplicateTextSignature(item));
  const clusters = clusterNewsItems(news, { now: NOW });

  assert.equal(exactKeys.size, 2);
  assert.equal(signatures.length, 2);
  assert.ok(signatures.every((signature) => /^[a-f0-9]{16}$/.test(signature.simhash64)));
  assert.ok(signatures.every((signature) => signature.minhash.length === 8));
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0]?.memberNewsItemIds, news.map((item) => item.id).sort());
  assert.equal(clusters[0]?.textSignature?.algorithm, "simhash64/minhash-v1");
  assert.ok(clusters[0]?.textSignature?.simhash64);
  assert.equal(clusters[0]?.textSignature?.memberSignatures.length, 2);
});

test("near-duplicate cluster identity is stable under shuffled source order", async () => {
  const adapter = createGdeltSourceAdapter([
    {
      url: "https://source-a.example.com/fed-path",
      title: "Federal Reserve approves rate cut timeline",
      seendate: "20260507T115900Z",
      domain: "source-a.example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Officials approved a timeline for lowering rates this summer.",
    },
    {
      url: "https://source-b.example.com/fed-timetable",
      title: "Fed approves rate-cut timetable, officials say",
      seendate: "20260507T120100Z",
      domain: "source-b.example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Federal Reserve officials approved a timetable to lower rates.",
    },
  ], { now: NOW });
  const raw = await adapter.fetchBatch();
  const news = (await Promise.all(raw.rawItems.map((item) => adapter.normalize(item)))).flat();
  const [forward] = clusterNewsItems(news, { now: NOW });
  const [shuffled] = clusterNewsItems([...news].reverse(), { now: NOW });

  assert.ok(forward);
  assert.ok(shuffled);
  assert.equal(forward.id, shuffled.id);
  assert.equal(forward.clusterKey, shuffled.clusterKey);
  assert.equal(forward.representativeNewsItemId, shuffled.representativeNewsItemId);
  assert.deepEqual(forward.memberNewsItemIds, shuffled.memberNewsItemIds);
  assert.deepEqual(forward.textSignature?.memberSignatures, shuffled.textSignature?.memberSignatures);
});

test("event clusters include ordered member timelines and observed first/last seen checkpoints", async () => {
  const adapter = createGdeltSourceAdapter([
    {
      url: "https://source-a.example.com/fed-path",
      title: "Federal Reserve approves rate cut timeline",
      seendate: "20260507T115900Z",
      domain: "source-a.example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Officials approved a timeline for lowering rates this summer.",
    },
    {
      url: "https://source-b.example.com/fed-timetable",
      title: "Fed approves rate-cut timetable, officials say",
      seendate: "20260507T120100Z",
      domain: "source-b.example.com",
      sourceCountry: "US",
      language: "English",
      summary: "Federal Reserve officials approved a timetable to lower rates.",
    },
  ], { now: NOW });
  const raw = await adapter.fetchBatch();
  const news = (await Promise.all(raw.rawItems.map((item) => adapter.normalize(item)))).flat();
  const timedNews = [
    { ...news[0]!, observedAt: "2026-05-07T12:04:00.000Z" },
    { ...news[1]!, observedAt: "2026-05-07T12:02:00.000Z" },
  ];
  const [cluster] = clusterNewsItems(timedNews, { now: NOW });

  assert.ok(cluster);
  assert.equal(cluster.firstSeenAt, "2026-05-07T12:02:00.000Z");
  assert.equal(cluster.lastSeenAt, "2026-05-07T12:04:00.000Z");
  assert.deepEqual(cluster.timeline?.map((entry) => entry.newsItemId), timedNews.map((item) => item.id));
  assert.deepEqual(cluster.timeline?.map((entry) => entry.observedAt), [
    "2026-05-07T12:04:00.000Z",
    "2026-05-07T12:02:00.000Z",
  ]);
  assert.equal(cluster.timeline?.find((entry) => entry.role === "representative")?.newsItemId, cluster.representativeNewsItemId);
  assert.ok(cluster.timeline?.every((entry) => entry.sourceId && entry.sourceClass && entry.title));
});

test("event clustering tracks refuted rumors and why-moved contradictory evidence", async () => {
  const social = createRedditSourceAdapter([
    {
      id: "reddit-fed-rumor",
      name: "t3_reddit_fed_rumor",
      title: "Federal Reserve approved rate cut timeline",
      selftext: "Traders say the Fed has already approved a rate cut before June.",
      subreddit: "polymarket",
      author: "macro_user",
      permalink: "/r/polymarket/comments/reddit_fed_rumor/fed_cut/",
      url: "https://www.reddit.com/r/polymarket/comments/reddit_fed_rumor/fed_cut/",
      createdUtc: 1778154000,
      score: 8,
      numComments: 3,
    },
  ], { now: NOW });
  const factCheck = createFactCheckSourceAdapter([
    {
      id: "factcheck-fed-rumor",
      title: "Fact check: Federal Reserve did not approve rate cut timeline",
      link: "https://factcheck.example.org/fed-rate-cut-rumor",
      published: "2026-05-07T11:45:00.000Z",
      summary: "No evidence supports the claim that the Federal Reserve approved a rate cut timeline before June.",
    },
  ], { now: NOW });
  const normalizeFirst = async <R>(adapter: SourceAdapter<R>) => {
    const raw = (await adapter.fetchBatch()).rawItems[0];
    assert.ok(raw);
    return adapter.normalize(raw);
  };
  const news = (await Promise.all([normalizeFirst(social), normalizeFirst(factCheck)])).flat();
  const clusters = clusterNewsItems(news, { now: NOW });

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.kind, "social_rumor");
  assert.equal(clusters[0]?.rumorStatus, "refuted");
  assert.equal(clusters[0]?.lifecycleStatus, "refuted");
  assert.ok((clusters[0]?.sourceDiversityScore ?? 0) > 0.3);
  assert.ok((clusters[0]?.noveltyScore ?? 0) >= 0);
  assert.equal(clusters[0]?.contradictions?.length, 1);
  assert.deepEqual(clusters[0]?.contradictions?.[0]?.contradictedNewsItemIds, [news[0]?.id]);
  assert.equal(clusters[0]?.contradictions?.[0]?.contradictingNewsItemId, news[1]?.id);

  const market = marketFixture({
    id: "m-fed-cut-rumor",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.62,
  });
  const move: MarketMove = {
    id: "move-fed-cut-rumor",
    marketId: market.id,
    timestamp: "2026-05-07T12:05:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.49,
    probabilityAfter: 0.62,
    volumeUsd: 240_000,
    source: "polymarket",
  };
  const [candidate] = explainWhyMoved({
    market,
    events: clusters,
    moves: [move],
    createdAt: NOW,
  });

  assert.ok(candidate);
  assert.deepEqual(candidate.conflictingNewsItemIds, [news[1]?.id]);
  assert.ok(candidate.reasons.includes("contradictory_evidence"));
  assert.ok(candidate.ruleIds.includes("why:penalty:contradictory_evidence"));

  const rows = buildIngestionBridgePersistenceRows({
    registry: DEFAULT_TERMINAL_SOURCE_REGISTRY,
    newsItems: news,
    eventClusters: clusters,
    markets: [],
    priceRecords: [],
    whyMovedCandidates: [candidate],
    now: NOW,
  });

  const eventClusterRow = rows.eventCluster[0] as {
    lifecycle_status?: string;
    rumor_status?: string;
    contradictions_json?: unknown;
  };
  const candidateRow = rows.whyMovedCandidate[0] as { conflicting_news_item_ids?: string[] };
  assert.equal(eventClusterRow.lifecycle_status, "refuted");
  assert.equal(eventClusterRow.rumor_status, "refuted");
  const persistedContradictions = eventClusterRow.contradictions_json as
    | Array<{ contradictingNewsItemId?: string }>
    | undefined;
  assert.equal(persistedContradictions?.[0]?.contradictingNewsItemId, news[1]?.id);
  assert.deepEqual(candidateRow.conflicting_news_item_ids, [news[1]?.id]);
});

test("raw payload replay rebuilds deterministic evidence from stored raw blob keys", async () => {
  const rawStore = createInMemoryRawPayloadStore(() => NOW);
  const rawRelease = {
    id: "fed:release:2026-05-07",
    title: "Federal Reserve approves rate cut timeline",
    link: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260507a.htm",
    published: "2026-05-07T11:59:00.000Z",
    summary: "The Committee approved a path toward lowering rates.",
  };
  const document = await rawStore.put({
    sourceId: "federal-reserve-rss",
    sourceClass: "official",
    externalId: rawRelease.id,
    fetchedAt: NOW,
    publishedAt: rawRelease.published,
    adapterVersion: "federal-reserve-rss@fixture-v1",
    rawPayload: rawRelease,
  });
  const market: Market = {
    id: "fixture-fed-rate-cut",
    source: { id: "polymarket", label: "Polymarket", kind: "polymarket" },
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    category: "Macro",
    event: "Federal Reserve rate decision",
    url: "https://polymarket.com/event/fed-rate-cut-fixture",
    description: "Resolves Yes if the Federal Reserve approves a rate cut by the deadline.",
    resolutionRules: "Official Federal Reserve source.",
    outcomes: [
      { id: "yes", label: "YES", probability: 0.62, price: 0.62 },
      { id: "no", label: "NO", probability: 0.38, price: 0.38 },
    ],
    probability: 0.62,
    volume24h: 240_000,
    volume7d: 700_000,
    liquidity: 900_000,
    openInterest: null,
    closeTime: "2026-06-30T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: NOW,
    status: "open",
    priceHistory: [
      { timestamp: "2026-05-07T11:35:00.000Z", probability: 0.49 },
      { timestamp: "2026-05-07T12:05:00.000Z", probability: 0.62 },
    ],
  };

  const replay = await replayRawPayloadsFromStore({
    rawBlobKeys: [document.rawBlobKey, "raw/missing/payload.json"],
    rawStore,
    markets: [market],
    now: NOW,
  });

  assert.equal(replay.readOnly, true);
  assert.deepEqual(replay.foundRawBlobKeys, [document.rawBlobKey]);
  assert.deepEqual(replay.missingRawBlobKeys, ["raw/missing/payload.json"]);
  assert.equal(replay.newsItems.length, 1);
  assert.equal(replay.newsItems[0]?.provenance[0]?.checksumSha256, document.checksumSha256);
  assert.equal(replay.eventClusters.length, 1);
  assert.deepEqual(replay.eventClusters[0]?.memberNewsItemIds, [replay.newsItems[0]?.id]);
  assert.equal(replay.whyMovedCandidates.length, 1);
  assert.ok(Object.values(replay.whyMovedCandidates[0]?.scoreBreakdown ?? {}).every((value) => typeof value === "number"));
  assert.ok(replay.whyMovedCandidates[0]?.ruleIds.some((ruleId) => ruleId.startsWith("why:")));
});

test("why-moved candidates include explicit score breakdown, market-family rules, and evidence IDs", () => {
  const market = marketFixture({
    id: "m-fed-cut",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.62,
  });
  const move: MarketMove = {
    id: "move-fed-cut",
    marketId: market.id,
    timestamp: "2026-05-07T12:05:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.49,
    probabilityAfter: 0.62,
    volumeUsd: 240_000,
    source: "polymarket",
  };
  const event = {
    id: "event-fed-cut",
    clusterKey: "fed-rate-cut",
    kind: "official_statement" as const,
    marketId: null,
    timestamp: "2026-05-07T11:59:00.000Z",
    title: "Federal Reserve approves rate cut timeline",
    summary: "The Committee approved a path toward lowering rates.",
    abstract: "The Committee approved a path toward lowering rates.",
    source: { id: "federal-reserve-rss", label: "Federal Reserve RSS", kind: "external" as const, url: "https://www.federalreserve.gov" },
    impact: "up" as const,
    importance: 95,
    firstSeenAt: "2026-05-07T11:59:00.000Z",
    lastSeenAt: "2026-05-07T11:59:00.000Z",
    timePrecision: "minute" as const,
    sourceCount: 1,
    sourceMix: ["official" as const],
    primaryEntityRefs: [{ kind: "org" as const, canonicalName: "Federal Reserve", aliases: ["Fed"], confidence: 0.95 }],
    topics: ["Federal Reserve", "rate cut"],
    sentiment: { label: "positive" as const, score: 0.2, ruleIds: ["sent_pos:/approved/"] },
    credibility: { score: 0.95, label: "high" as const, reasons: ["base:official"], ruleIds: ["cred:base:official"] },
    representativeNewsItemId: "news-fed-cut",
    memberNewsItemIds: ["news-fed-cut"],
    provenance: [
      {
        sourceId: "federal-reserve-rss",
        sourceClass: "official" as const,
        externalId: "fed:release:2026-05-07",
        sourceUrl: "https://www.federalreserve.gov",
        fetchedAt: NOW,
        publishedAt: "2026-05-07T11:59:00.000Z",
        rawBlobKey: "raw/federal-reserve-rss/2026-05-07/fed.json",
        checksumSha256: "a".repeat(64),
        adapterVersion: "federal-reserve-rss@fixture-v1",
      },
    ],
  };

  const [candidate] = explainWhyMoved({
    market,
    events: [event],
    moves: [move],
    createdAt: NOW,
  });

  assert.equal(candidate?.marketId, market.id);
  assert.equal(candidate?.eventId, event.id);
  assert.equal(candidate?.direction, "yes");
  assert.ok((candidate?.confidence ?? 0) > 0.7);
  assert.equal(candidate?.observedPriceMove?.absChange, 0.13);
  assert.deepEqual(candidate?.supportingNewsItemIds, ["news-fed-cut"]);
  assert.ok(candidate?.reasons.some((reason) => reason.includes("direction:approval_yes")));
  assert.ok(candidate?.ruleIds.includes("why:market_family:approval"));
  assert.ok(Object.values(candidate?.scoreBreakdown ?? {}).every((value) => typeof value === "number"));
});

test("event-to-market linker generates candidates and filters unrelated why-moved evidence", async () => {
  const { linkEventsToMarkets } = await import("../src/lib/terminal/source-intelligence.ts") as typeof import("../src/lib/terminal/source-intelligence.ts") & {
    linkEventsToMarkets?: (events: Array<Record<string, unknown>>, markets: Market[]) => Array<{
      eventId: string;
      marketId: string;
      status: string;
      score: number;
      reasons: string[];
      ruleIds: string[];
    }>;
  };
  assert.equal(typeof linkEventsToMarkets, "function");

  const market = marketFixture({
    id: "m-fed-cut-link",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.62,
  });
  const move: MarketMove = {
    id: "move-fed-cut-link",
    marketId: market.id,
    timestamp: "2026-05-07T12:05:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.49,
    probabilityAfter: 0.62,
    volumeUsd: 740_000,
    source: "polymarket-public",
  };
  const relatedEvent = {
    id: "event-fed-cut-link",
    clusterKey: "fed-cut-link",
    kind: "official_statement" as const,
    marketId: null,
    timestamp: "2026-05-07T11:59:00.000Z",
    title: "Federal Reserve approves rate cut timeline",
    summary: "The Committee approved a path toward lowering rates.",
    abstract: "The Committee approved a path toward lowering rates.",
    source: { id: "federal-reserve-rss", label: "Federal Reserve RSS", kind: "external" as const, url: "https://www.federalreserve.gov" },
    impact: "up" as const,
    importance: 95,
    firstSeenAt: "2026-05-07T11:59:00.000Z",
    lastSeenAt: "2026-05-07T11:59:00.000Z",
    timePrecision: "minute" as const,
    sourceCount: 1,
    sourceMix: ["official" as const],
    primaryEntityRefs: [{ kind: "org" as const, canonicalName: "Federal Reserve", aliases: ["Fed"], confidence: 0.95 }],
    topics: ["Federal Reserve", "rate cut"],
    sentiment: { label: "positive" as const, score: 0.2, ruleIds: ["sent_pos:/approved/"] },
    credibility: { score: 0.95, label: "high" as const, reasons: ["base:official"], ruleIds: ["cred:base:official"] },
    representativeNewsItemId: "news-fed-cut-link",
    memberNewsItemIds: ["news-fed-cut-link"],
    provenance: [],
  };
  const unrelatedEvent = {
    id: "event-usgs-taiwan-link",
    clusterKey: "taiwan-earthquake-link",
    kind: "breaking_news" as const,
    marketId: null,
    timestamp: "2026-05-07T12:00:00.000Z",
    title: "USGS reports 6.1 magnitude earthquake near Hualien Taiwan",
    summary: "The United States Geological Survey reports a regional earthquake.",
    abstract: "The United States Geological Survey reports a regional earthquake.",
    source: { id: "usgs-earthquakes", label: "USGS", kind: "external" as const, url: "https://earthquake.usgs.gov" },
    impact: "up" as const,
    importance: 95,
    firstSeenAt: "2026-05-07T12:00:00.000Z",
    lastSeenAt: "2026-05-07T12:00:00.000Z",
    timePrecision: "minute" as const,
    sourceCount: 2,
    sourceMix: ["official" as const, "news_api" as const],
    primaryEntityRefs: [
      { kind: "org" as const, canonicalName: "USGS", aliases: ["United States Geological Survey"], confidence: 0.9 },
      { kind: "place" as const, canonicalName: "Taiwan", aliases: ["Hualien"], confidence: 0.86 },
    ],
    topics: ["earthquake", "Taiwan"],
    sentiment: { label: "neutral" as const, score: 0, ruleIds: [] },
    credibility: { score: 0.95, label: "high" as const, reasons: ["base:official"], ruleIds: ["cred:base:official"] },
    representativeNewsItemId: "news-usgs-taiwan-link",
    memberNewsItemIds: ["news-usgs-taiwan-link"],
    provenance: [],
  };

  const links = linkEventsToMarkets!([unrelatedEvent, relatedEvent], [market]);
  assert.equal(links[0]?.eventId, relatedEvent.id);
  assert.equal(links[0]?.marketId, market.id);
  assert.equal(links[0]?.status, "linked");
  assert.ok((links[0]?.score ?? 0) >= 0.5);
  assert.ok(links[0]?.ruleIds.includes("why:link:entity_overlap"));
  assert.equal(links.find((link) => link.eventId === unrelatedEvent.id)?.status, "unrelated");

  const candidates = explainWhyMoved({
    market,
    events: [unrelatedEvent, relatedEvent],
    moves: [move],
    createdAt: NOW,
  });

  assert.deepEqual(candidates.map((candidate) => candidate.eventId), [relatedEvent.id]);
  assert.equal(candidates[0]?.eventMarketLink?.eventId, relatedEvent.id);
  assert.equal(candidates[0]?.eventMarketLink?.status, "linked");
  assert.ok(candidates[0]?.ruleIds.includes("why:link:entity_overlap"));

  const rows = buildIngestionBridgePersistenceRows({
    registry: DEFAULT_TERMINAL_SOURCE_REGISTRY,
    newsItems: [],
    eventClusters: [relatedEvent],
    markets: [],
    priceRecords: [],
    whyMovedCandidates: candidates,
    now: NOW,
  });

  assert.equal((rows.whyMovedCandidate[0]?.event_market_link_json as { status?: string } | undefined)?.status, "linked");
});

test("why-moved candidates preserve reaction move identity through persistence", async () => {
  const market = marketFixture({
    id: "m-fed-cut-multi-move",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.72,
  });
  const moves: MarketMove[] = [
    {
      id: "move-fed-cut-first",
      marketId: market.id,
      timestamp: "2026-05-07T12:05:00.000Z",
      windowMinutes: 30,
      probabilityBefore: 0.49,
      probabilityAfter: 0.62,
      volumeUsd: 340_000,
      source: "polymarket-public",
    },
    {
      id: "move-fed-cut-second",
      marketId: market.id,
      timestamp: "2026-05-07T12:20:00.000Z",
      windowMinutes: 30,
      probabilityBefore: 0.62,
      probabilityAfter: 0.72,
      volumeUsd: 420_000,
      source: "polymarket-public",
    },
  ];
  const event = {
    id: "event-fed-cut-multi-move",
    clusterKey: "fed-cut-multi-move",
    kind: "official_statement" as const,
    marketId: null,
    timestamp: "2026-05-07T11:59:00.000Z",
    title: "Federal Reserve approves rate cut timeline",
    summary: "The Committee approved a path toward lowering rates.",
    abstract: "The Committee approved a path toward lowering rates.",
    source: { id: "federal-reserve-rss", label: "Federal Reserve RSS", kind: "external" as const, url: "https://www.federalreserve.gov" },
    impact: "up" as const,
    importance: 95,
    firstSeenAt: "2026-05-07T11:59:00.000Z",
    lastSeenAt: "2026-05-07T11:59:00.000Z",
    timePrecision: "minute" as const,
    sourceCount: 1,
    sourceMix: ["official" as const],
    primaryEntityRefs: [{ kind: "org" as const, canonicalName: "Federal Reserve", aliases: ["Fed"], confidence: 0.95 }],
    topics: ["Federal Reserve", "rate cut"],
    sentiment: { label: "positive" as const, score: 0.2, ruleIds: ["sent_pos:/approved/"] },
    credibility: { score: 0.95, label: "high" as const, reasons: ["base:official"], ruleIds: ["cred:base:official"] },
    representativeNewsItemId: "news-fed-cut-multi-move",
    memberNewsItemIds: ["news-fed-cut-multi-move"],
    provenance: [],
  };

  const whyMovedCandidates = explainWhyMoved({
    market,
    events: [event],
    moves,
    createdAt: NOW,
  });
  const candidateMoveIds = whyMovedCandidates.map((candidate) => candidate.moveId).sort();

  assert.equal(whyMovedCandidates.length, 2);
  assert.deepEqual(candidateMoveIds, ["move-fed-cut-first", "move-fed-cut-second"]);

  const rows = buildIngestionBridgePersistenceRows({
    registry: DEFAULT_TERMINAL_SOURCE_REGISTRY,
    newsItems: [],
    eventClusters: [event],
    markets: [],
    priceRecords: [],
    whyMovedCandidates,
    now: NOW,
  });
  assert.deepEqual(
    rows.whyMovedCandidate.map((row) => row.move_id).sort(),
    ["move-fed-cut-first", "move-fed-cut-second"],
  );

  const calls: Array<{ path: string; rows: unknown[] }> = [];
  await persistIngestionBridgeArtifacts({
    registry: DEFAULT_TERMINAL_SOURCE_REGISTRY,
    newsItems: [],
    eventClusters: [event],
    markets: [],
    priceRecords: [],
    whyMovedCandidates,
    now: NOW,
  }, {
    configured: true,
    request: async (path, init) => {
      calls.push({ path, rows: JSON.parse(String(init.body)) as unknown[] });
      return [];
    },
  });

  assert.equal(
    calls.find((call) => call.path.startsWith("/rest/v1/why_moved_candidate"))?.path,
    "/rest/v1/why_moved_candidate?on_conflict=market_id%2Cevent_id%2Cmove_id",
  );
});

test("why-moved candidates mark weak support as insufficient evidence with weak move quality", () => {
  const market = marketFixture({
    id: "m-apple-approval-rumor",
    title: "Will Apple approve a new AI product launch by June 2026?",
    event: "Apple product approval",
    probability: 0.515,
  });
  const move: MarketMove = {
    id: "move-apple-approval-rumor",
    marketId: market.id,
    timestamp: "2026-05-07T12:02:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.5,
    probabilityAfter: 0.515,
    volumeUsd: 9_000,
    source: "polymarket",
  };
  const event = {
    id: "event-apple-approval-rumor",
    clusterKey: "apple-approval-rumor",
    kind: "social_rumor" as const,
    marketId: null,
    timestamp: "2026-05-07T12:00:00.000Z",
    title: "Apple rumor says board approved new AI product launch",
    summary: "A social post claims Apple approved the product launch.",
    abstract: "A social post claims Apple approved the product launch.",
    source: { id: "reddit-oauth", label: "Reddit", kind: "external" as const, url: "https://reddit.example/apple-rumor" },
    impact: "up" as const,
    importance: 40,
    firstSeenAt: "2026-05-07T12:00:00.000Z",
    lastSeenAt: "2026-05-07T12:00:00.000Z",
    timePrecision: "minute" as const,
    sourceCount: 1,
    sourceMix: ["social" as const],
    primaryEntityRefs: [{ kind: "ticker" as const, canonicalName: "AAPL", aliases: ["Apple"], confidence: 0.9 }],
    topics: ["Apple", "approval"],
    sentiment: { label: "positive" as const, score: 0.1, ruleIds: ["sent_pos:/approved/"] },
    credibility: { score: 0.4, label: "low" as const, reasons: ["base:social"], ruleIds: ["cred:base:social"] },
    rumorStatus: "unverified" as const,
    lifecycleStatus: "new" as const,
    representativeNewsItemId: "news-apple-rumor",
    memberNewsItemIds: ["news-apple-rumor"],
    provenance: [],
  };

  const [candidate] = explainWhyMoved({
    market,
    events: [event],
    moves: [move],
    createdAt: NOW,
  });

  assert.ok(candidate);
  assert.equal(candidate.evidenceStatus, "insufficient_evidence");
  assert.equal(candidate.moveQuality?.label, "weak");
  assert.ok((candidate.moveQuality?.score ?? 1) < 0.45);
  assert.ok(candidate.ruleIds.includes("why:evidence:insufficient"));
  assert.ok(candidate.ruleIds.includes("why:move_quality:weak"));

  const rows = buildIngestionBridgePersistenceRows({
    registry: DEFAULT_TERMINAL_SOURCE_REGISTRY,
    newsItems: [],
    eventClusters: [event],
    markets: [],
    priceRecords: [],
    whyMovedCandidates: [candidate],
    now: NOW,
  });
  const row = rows.whyMovedCandidate[0] as {
    evidence_status?: string;
    move_quality_json?: { label?: string };
  };
  assert.equal(row.evidence_status, "insufficient_evidence");
  assert.equal(row.move_quality_json?.label, "weak");
});

test("why-moved candidates flag divergent market moves and score strong moves", () => {
  const market = marketFixture({
    id: "m-fed-cut-divergent",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.49,
  });
  const move: MarketMove = {
    id: "move-fed-cut-divergent",
    marketId: market.id,
    timestamp: "2026-05-07T12:05:00.000Z",
    windowMinutes: 30,
    probabilityBefore: 0.62,
    probabilityAfter: 0.49,
    volumeUsd: 640_000,
    source: "polymarket",
  };
  const event = {
    id: "event-fed-cut-divergent",
    clusterKey: "fed-rate-cut-divergent",
    kind: "official_statement" as const,
    marketId: null,
    timestamp: "2026-05-07T11:59:00.000Z",
    title: "Federal Reserve approves rate cut timeline",
    summary: "The Committee approved a path toward lowering rates.",
    abstract: "The Committee approved a path toward lowering rates.",
    source: { id: "federal-reserve-rss", label: "Federal Reserve RSS", kind: "external" as const, url: "https://www.federalreserve.gov" },
    impact: "up" as const,
    importance: 95,
    firstSeenAt: "2026-05-07T11:59:00.000Z",
    lastSeenAt: "2026-05-07T11:59:00.000Z",
    timePrecision: "minute" as const,
    sourceCount: 1,
    sourceMix: ["official" as const],
    primaryEntityRefs: [{ kind: "org" as const, canonicalName: "Federal Reserve", aliases: ["Fed"], confidence: 0.95 }],
    topics: ["Federal Reserve", "rate cut"],
    sentiment: { label: "positive" as const, score: 0.2, ruleIds: ["sent_pos:/approved/"] },
    credibility: { score: 0.95, label: "high" as const, reasons: ["base:official"], ruleIds: ["cred:base:official"] },
    representativeNewsItemId: "news-fed-cut-divergent",
    memberNewsItemIds: ["news-fed-cut-divergent"],
    provenance: [],
  };

  const [candidate] = explainWhyMoved({
    market,
    events: [event],
    moves: [move],
    createdAt: NOW,
  });

  assert.ok(candidate);
  assert.equal(candidate.direction, "yes");
  assert.equal(candidate.evidenceStatus, "divergent_market");
  assert.equal(candidate.marketDivergence?.detected, true);
  assert.equal(candidate.marketDivergence?.expectedDirection, "yes");
  assert.equal(candidate.marketDivergence?.observedDirection, "no");
  assert.equal(candidate.moveQuality?.label, "strong");
  assert.ok((candidate.moveQuality?.score ?? 0) >= 0.72);
  assert.ok(candidate.ruleIds.includes("why:market_divergence:opposes_expected"));
  assert.ok(candidate.ruleIds.includes("why:move_quality:strong"));
});

test("Polymarket market registry reconciliation preserves metadata and price reaction windows", () => {
  const market = marketFixture({
    id: "m-fed-cut",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.62,
  });
  const registryRecord = marketToRegistryRecord(market);
  const priceRecords = marketToPriceRecords(market);
  const reactionWindows = detectPriceReactionWindows(market, { minAbsChange: 0.05 });
  const reconciled = reconcileMarketRegistry([market]);

  assert.equal(registryRecord.marketId, market.id);
  assert.equal(registryRecord.question, market.title);
  assert.equal(registryRecord.status, "open");
  assert.equal(registryRecord.url, market.url);
  assert.deepEqual(registryRecord.entityRefs.map((entity) => entity.name), ["Federal Reserve"]);
  assert.equal(priceRecords.length, 2);
  assert.deepEqual(priceRecords.map((record) => record.source), ["polymarket-public", "polymarket-public"]);
  assert.equal(reactionWindows.length, 1);
  assert.equal(reactionWindows[0]?.marketId, market.id);
  assert.equal(reactionWindows[0]?.probabilityBefore, 0.49);
  assert.equal(reactionWindows[0]?.probabilityAfter, 0.62);
  assert.equal(reactionWindows[0]?.source, "polymarket-public");
  assert.equal(reconciled.registry.length, 1);
  assert.deepEqual(reconciled.registry[0]?.entityRefs.map((entity) => entity.name), ["Federal Reserve"]);
  assert.equal(reconciled.priceRecords.length, 2);
  assert.equal(reconciled.reactionWindows.length, 1);
});

test("ingestion bridge persistence maps artifacts to durable rows and no-ops without credentials", async () => {
  const adapter = createFedRssSourceAdapter([
    {
      id: "fed:release:2026-05-07",
      title: "Federal Reserve approves rate cut timeline",
      link: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260507a.htm",
      published: "2026-05-07T11:59:00.000Z",
      summary: "The Committee approved a path toward lowering rates.",
    },
  ], { now: NOW });
  const batch = await adapter.fetchBatch({ sinceIso: "2026-05-07T11:00:00.000Z" });
  const newsItems = (await Promise.all(batch.rawItems.map((raw) => adapter.normalize(raw)))).flat();
  const eventClusters = clusterNewsItems(newsItems, { now: NOW });
  const market = marketFixture({
    id: "m-fed-cut",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.62,
  });
  const reconciled = reconcileMarketRegistry([market]);
  const whyMovedCandidates = explainWhyMoved({
    market,
    events: eventClusters,
    moves: reconciled.reactionWindows,
    createdAt: NOW,
  });
  const artifacts = {
    registry: DEFAULT_TERMINAL_SOURCE_REGISTRY,
    sourceHealth: [
      {
        sourceId: "federal-reserve-rss",
        sourceClass: "official" as const,
        health: "healthy" as const,
        lastSuccessAt: NOW,
        lastAttemptAt: NOW,
        lastCursor: JSON.stringify(batch.nextCursor),
        consecutiveFailures: 0,
        itemsFetchedLastRun: 1,
        itemsAcceptedLastRun: 1,
      },
    ],
    newsItems,
    eventClusters,
    markets: reconciled.registry,
    priceRecords: reconciled.priceRecords,
    whyMovedCandidates,
    now: NOW,
  };

  const rows = buildIngestionBridgePersistenceRows(artifacts);

  assert.equal(rows.sourceRegistry.length, DEFAULT_TERMINAL_SOURCE_REGISTRY.length);
  assert.equal(rows.sourceCursor.length, 1);
  assert.equal(rows.rawDocument.length, 1);
  assert.match(String(rows.rawDocument[0]?.checksum_sha256), /^[a-f0-9]{64}$/);
  assert.equal(rows.newsItem.length, 1);
  assert.deepEqual(rows.newsItem[0]?.provenance_json, newsItems[0]?.provenance);
  assert.equal(rows.eventCluster.length, 1);
  assert.equal(Array.isArray(rows.eventCluster[0]?.timeline_json), true);
  assert.equal((rows.eventCluster[0]?.timeline_json as Array<{ newsItemId: string }>)[0]?.newsItemId, newsItems[0]?.id);
  assert.equal(rows.eventClusterMember.length, 1);
  assert.equal(rows.marketRegistry.length, 1);
  assert.deepEqual((rows.marketRegistry[0]?.entities_json as Array<{ name: string }>).map((entity) => entity.name), ["Federal Reserve"]);
  assert.equal(rows.marketPrice.length, 2);
  assert.equal(rows.whyMovedCandidate.length, 1);
  const sourceHealthOutbox = rows.deliveryOutbox.find((row) => row.topic === "terminal.source_health");
  assert.deepEqual(sourceHealthOutbox?.payload_json, artifacts.sourceHealth[0]);
  assert.equal(sourceHealthOutbox?.created_at, NOW);
  assert.ok(rows.deliveryOutbox.some((row) => row.topic === "terminal.why_moved_candidate"));

  const calls: Array<{ path: string; rows: unknown[] }> = [];
  const persisted = await persistIngestionBridgeArtifacts(artifacts, {
    configured: true,
    request: async (path, init) => {
      calls.push({ path, rows: JSON.parse(String(init.body)) as unknown[] });
      return [];
    },
  });

  assert.equal(persisted.persisted, true);
  assert.deepEqual(calls.map((call) => call.path.split("?")[0]), [
    "/rest/v1/source_registry",
    "/rest/v1/source_cursor",
    "/rest/v1/raw_document",
    "/rest/v1/news_item",
    "/rest/v1/event_cluster",
    "/rest/v1/event_cluster_member",
    "/rest/v1/market_registry",
    "/rest/v1/market_price",
    "/rest/v1/why_moved_candidate",
    "/rest/v1/delivery_outbox",
  ]);
  assert.ok(calls.every((call) => call.rows.length > 0));

  const skipped = await persistIngestionBridgeArtifacts(artifacts, {
    configured: false,
    request: async () => {
      throw new Error("request should not run");
    },
  });

  assert.equal(skipped.persisted, false);
  assert.equal(skipped.skippedReason, "Supabase is not configured");
});

test("source cursor persistence records run telemetry without clearing missing cursors", () => {
  const rows = buildIngestionBridgePersistenceRows({
    registry: [],
    sourceHealth: [
      {
        sourceId: "gdelt-doc",
        sourceClass: "news_api",
        health: "failing",
        lastAttemptAt: NOW,
        lastHttpStatus: 429,
        rateLimitRemaining: 0,
        rateLimitResetAt: "2026-05-07T12:05:00.000Z",
        consecutiveFailures: 3,
        itemsFetchedLastRun: 0,
        itemsAcceptedLastRun: 0,
        lastError: "upstream 429",
      },
    ],
    newsItems: [],
    eventClusters: [],
    markets: [],
    priceRecords: [],
    whyMovedCandidates: [],
    now: NOW,
  });

  const row = rows.sourceCursor[0]!;
  assert.equal(Object.prototype.hasOwnProperty.call(row, "cursor_json"), false);
  assert.equal(row.last_http_status, 429);
  assert.equal(row.rate_limit_remaining, 0);
  assert.equal(row.rate_limit_reset_at, "2026-05-07T12:05:00.000Z");
  assert.equal(row.items_fetched_last_run, 0);
  assert.equal(row.items_accepted_last_run, 0);
  assert.equal(row.last_error, "upstream 429");
});

test("terminal outbox reader maps durable rows to read-only SSE events and no-ops without config", async () => {
  const events = await fetchDeliveryOutboxEvents({
    afterSeq: 41,
    limit: 2,
    config: {
      url: "https://example.supabase.co",
      key: "server-key",
    },
    request: async (path, init) => {
      assert.equal(
        path,
        "/rest/v1/delivery_outbox?select=seq%2Ctopic%2Cpayload_json%2Ccreated_at%2Csent_at&sent_at=is.null&seq=gt.41&order=seq.asc&limit=2",
      );
      assert.equal(init.headers.Authorization, "Bearer server-key");
      return [
        {
          seq: 42,
          topic: "terminal.why_moved_candidate",
          payload_json: { id: "why-1", marketId: "m-fed-cut" },
          created_at: NOW,
          sent_at: null,
        },
      ];
    },
  });

  assert.deepEqual(events, [
    {
      seq: 42,
      topic: "terminal.why_moved_candidate",
      payload: { id: "why-1", marketId: "m-fed-cut" },
      createdAt: NOW,
      sentAt: null,
    },
  ]);
  assert.equal(formatSseEvent(events[0]!), [
    "id: 42",
    "event: terminal.why_moved_candidate",
    'data: {"id":"why-1","marketId":"m-fed-cut"}',
    "",
    "",
  ].join("\n"));

  assert.equal(terminalOutboxConfigFromEnv({}), null);
  assert.equal(terminalOutboxConfigFromEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
  }), null);
  assert.deepEqual(await fetchDeliveryOutboxEvents({ config: null }), []);
});

test("terminal outbox publisher sends rows and marks them sent", async () => {
  const published: Array<{ topic: string; payload: unknown }> = [];
  const calls: Array<{ path: string; init: RequestInit & { headers: Record<string, string> } }> = [];
  const result = await publishDeliveryOutboxEvents({
    afterSeq: 40,
    limit: 2,
    now: NOW,
    config: {
      url: "https://example.supabase.co",
      key: "server-key",
    },
    request: async (path, init) => {
      calls.push({ path, init });
      if (init.method === "GET") {
        return [
          {
            seq: 42,
            topic: "terminal.why_moved_candidate",
            payload_json: { id: "why-1" },
            created_at: NOW,
            sent_at: null,
          },
          {
            seq: 43,
            topic: "terminal.event_cluster",
            payload_json: { id: "event-1" },
            created_at: NOW,
            sent_at: null,
          },
        ];
      }
      assert.equal(path, "/rest/v1/delivery_outbox?seq=in.(42,43)&sent_at=is.null");
      assert.equal(init.method, "PATCH");
      assert.deepEqual(JSON.parse(String(init.body)), { sent_at: NOW });
      return [];
    },
    publish: async (event) => {
      published.push({ topic: event.topic, payload: event.payload });
    },
  });

  assert.deepEqual(published, [
    { topic: "terminal.why_moved_candidate", payload: { id: "why-1" } },
    { topic: "terminal.event_cluster", payload: { id: "event-1" } },
  ]);
  assert.equal(result.fetched, 2);
  assert.equal(result.published, 2);
  assert.equal(result.markedSent, 2);
  assert.equal(calls.length, 2);
});

test("terminal source health snapshot reads durable cursor status when configured", async () => {
  const calls: Array<{ path: string; init: RequestInit & { headers: Record<string, string> } }> = [];
  const snapshot = await fetchTerminalSourceHealthSnapshot({
    now: NOW,
    config: {
      url: "https://example.supabase.co",
      serviceKey: "service-role-key",
    },
    request: async (path, init) => {
      calls.push({ path, init });
      if (path.startsWith("/rest/v1/source_registry")) {
        return [
          {
            source_id: "gdelt-doc",
            source_class: "news_api",
            label: "GDELT DOC",
            enabled: true,
            read_only: true,
            priority: 10,
            poll_interval_sec: 300,
            adapter_version: "gdelt-doc@fixture-v1",
            base_url: "https://api.gdeltproject.org/api/v2/doc/doc",
            rate_limit_per_minute: 30,
          },
        ];
      }
      if (path.startsWith("/rest/v1/source_cursor")) {
        return [
          {
            source_id: "gdelt-doc",
            cursor_json: { sinceIso: "2026-05-07T11:00:00.000Z" },
            last_success_at: "2026-05-07T11:00:00.000Z",
            last_attempt_at: "2026-05-07T11:58:00.000Z",
            last_http_status: 429,
            rate_limit_remaining: 0,
            rate_limit_reset_at: "2026-05-07T12:05:00.000Z",
            consecutive_failures: 2,
            items_fetched_last_run: 0,
            items_accepted_last_run: 0,
            last_error: "upstream 429",
          },
        ];
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.init.headers.Authorization === "Bearer service-role-key"));
  assert.equal(snapshot.sourceHealth.length, 1);
  assert.equal(snapshot.sourceHealth[0]?.sourceId, "gdelt-doc");
  assert.equal(snapshot.sourceHealth[0]?.health, "degraded");
  assert.equal(snapshot.sourceHealth[0]?.lagSeconds, 3600);
  assert.equal(snapshot.sourceHealth[0]?.lastCursor, "{\"sinceIso\":\"2026-05-07T11:00:00.000Z\"}");
  assert.equal(snapshot.sourceHealth[0]?.lastHttpStatus, 429);
  assert.equal(snapshot.sourceHealth[0]?.rateLimitRemaining, 0);
  assert.equal(snapshot.sourceHealth[0]?.rateLimitResetAt, "2026-05-07T12:05:00.000Z");
  assert.equal(snapshot.sourceHealth[0]?.itemsFetchedLastRun, 0);
  assert.equal(snapshot.sourceHealth[0]?.itemsAcceptedLastRun, 0);
  assert.equal(snapshot.sourceHealth[0]?.lastError, "upstream 429");
  assert.equal(snapshot.registry[0]?.readOnly, true);

  const fallback = await fetchTerminalSourceHealthSnapshot({ now: NOW, config: null });
  assert.equal(fallback.registry.length, DEFAULT_TERMINAL_SOURCE_REGISTRY.length);
  assert.equal(fallback.sourceHealth.length, DEFAULT_TERMINAL_SOURCE_REGISTRY.length);
});

test("terminal ingestion runner stores raw payloads, commits cursors, and persists artifacts", async () => {
  const rawRelease = {
    id: "fed:release:2026-05-07",
    title: "Federal Reserve approves rate cut timeline",
    link: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260507a.htm",
    published: "2026-05-07T11:59:00.000Z",
    summary: "The Committee approved a path toward lowering rates.",
  };
  const adapter = createFedRssSourceAdapter([rawRelease], { now: NOW });
  const rawStore = createInMemoryRawPayloadStore();
  const cursorStore = createInMemoryTerminalCursorStore({
    "federal-reserve-rss": { sinceIso: "2026-05-07T11:00:00.000Z" },
  });
  const market = marketFixture({
    id: "m-fed-cut",
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    event: "Federal Reserve rate decision",
    probability: 0.62,
  });
  const persistedArtifacts: unknown[] = [];

  const result = await runTerminalIngestionBridge({
    adapters: [adapter as SourceAdapter<unknown>],
    markets: [market],
    rawStore,
    cursorStore,
    now: NOW,
    persist: async (artifacts) => {
      persistedArtifacts.push(artifacts);
      const rows = buildIngestionBridgePersistenceRows(artifacts);
      return {
        persisted: true,
        rows: countPersistenceRows(rows),
      };
    },
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.sourceId, "federal-reserve-rss");
  assert.equal(result.sources[0]?.health.health, "healthy");
  assert.equal(result.sources[0]?.rawDocuments, 1);
  assert.equal(result.artifacts.rawDocuments?.length, 1);
  assert.equal(result.artifacts.newsItems.length, 1);
  assert.equal(result.artifacts.eventClusters.length, 1);
  assert.equal(result.artifacts.marketRegistry.length, 1);
  assert.equal(result.artifacts.marketPrice.length, 2);
  assert.equal(result.artifacts.whyMovedCandidates.length, 1);
  assert.equal(result.persistence.persisted, true);
  assert.equal(persistedArtifacts.length, 1);

  const storedRaw = rawStore.get(result.artifacts.rawDocuments?.[0]?.rawBlobKey ?? "");
  assert.deepEqual(storedRaw?.payload, rawRelease);
  assert.match(storedRaw?.document.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(cursorStore.getCursor("federal-reserve-rss"), {
    after: "fed:release:2026-05-07",
    sinceIso: NOW,
  });
});

test("terminal ingestion runner awaits durable cursor reads and commits", async () => {
  const adapter = createFedRssSourceAdapter([
    {
      id: "fed:new",
      title: "Federal Reserve publishes newer statement",
      link: "https://www.federalreserve.gov/new.htm",
      published: "2026-05-07T11:30:00.000Z",
      summary: "Newer item should pass the durable cursor.",
    },
  ], { now: NOW });
  const commits: Array<{ sourceId: string; cursor: unknown; updatedAt: string }> = [];
  const cursorStore = {
    async getCursor(sourceId: string) {
      assert.equal(sourceId, "federal-reserve-rss");
      await Promise.resolve();
      return { sinceIso: "2026-05-07T11:00:00.000Z" };
    },
    async commitCursor(sourceId: string, cursor: unknown, updatedAt: string) {
      await Promise.resolve();
      commits.push({ sourceId, cursor, updatedAt });
    },
  };

  const result = await runTerminalIngestionBridge({
    adapters: [adapter as SourceAdapter<unknown>],
    cursorStore,
    now: NOW,
    persist: async (artifacts) => ({
      persisted: true,
      rows: countPersistenceRows(buildIngestionBridgePersistenceRows(artifacts)),
    }),
  });

  assert.equal(result.sources[0]?.fetched, 1);
  assert.equal(result.sources[0]?.cursorCommitted, true);
  assert.deepEqual(commits, [
    {
      sourceId: "federal-reserve-rss",
      cursor: {
        after: "fed:new",
        sinceIso: NOW,
      },
      updatedAt: NOW,
    },
  ]);
});

test("terminal ingestion runner retries transient source fetches with deterministic backoff", async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  const adapter: SourceAdapter<unknown> = {
    sourceId: "gdelt-doc",
    sourceClass: "news_api",
    async fetchBatch() {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("temporary upstream 503"), { status: 503 });
      }
      return {
        rawItems: [{ id: "gdelt-retry-row" }],
        nextCursor: { after: "gdelt-retry-row", sinceIso: NOW },
        sourceStatus: {
          lastHttpStatus: 200,
        },
      };
    },
    async normalize() {
      return [];
    },
    buildExternalId() {
      return "gdelt-retry-row";
    },
    buildIdempotencyKey() {
      return "gdelt-retry-row";
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return {
        sourceId: "gdelt-doc",
        sourceClass: "news_api",
        health: "healthy",
        consecutiveFailures: 0,
        lastAttemptAt: NOW,
      };
    },
  };

  const result = await runTerminalIngestionBridge({
    adapters: [adapter],
    markets: [],
    now: NOW,
    retry: {
      maxAttempts: 2,
      backoffMs: 25,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
    persist: async (artifacts) => ({
      persisted: true,
      rows: countPersistenceRows(buildIngestionBridgePersistenceRows(artifacts)),
    }),
  });

  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [25]);
  assert.equal(result.sources[0]?.health.health, "healthy");
  assert.equal(result.sources[0]?.health.lastHttpStatus, 200);
  assert.equal(result.sources[0]?.fetched, 1);
  assert.equal(result.sources[0]?.cursorCommitted, true);
});

test("Supabase terminal cursor store reads and upserts committed bridge cursors", async () => {
  const calls: Array<{ path: string; init: RequestInit & { headers: Record<string, string>; prefer?: string } }> = [];
  const store = createSupabaseTerminalCursorStore({
    config: {
      url: "https://example.supabase.co",
      serviceKey: "service-role-key",
    },
    request: async (path, init) => {
      calls.push({ path, init });
      if (init.method === "GET") {
        assert.equal(path, "/rest/v1/source_cursor?select=cursor_json&source_id=eq.gdelt-doc&limit=1");
        assert.equal(init.headers.Authorization, "Bearer service-role-key");
        return [{ cursor_json: { sinceIso: "2026-05-07T10:00:00.000Z", after: "old" } }];
      }
      assert.equal(path, "/rest/v1/source_cursor?on_conflict=source_id");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.apikey, "service-role-key");
      assert.equal(init.prefer, "resolution=merge-duplicates");
      assert.deepEqual(JSON.parse(String(init.body)), [{
        source_id: "gdelt-doc",
        cursor_json: { sinceIso: NOW, after: "new" },
        last_success_at: NOW,
        last_attempt_at: NOW,
        consecutive_failures: 0,
        updated_at: NOW,
      }]);
      return [];
    },
  });

  assert.deepEqual(await store.getCursor("gdelt-doc"), {
    sinceIso: "2026-05-07T10:00:00.000Z",
    after: "old",
  });
  await store.commitCursor("gdelt-doc", { sinceIso: NOW, after: "new" }, NOW);

  assert.deepEqual(calls.map((call) => call.init.method), ["GET", "POST"]);
});

test("Supabase raw payload store writes immutable JSON envelopes to server-side Storage", async () => {
  const calls: Array<{ path: string; init: RequestInit & { headers: Record<string, string> } }> = [];
  const store = createSupabaseRawPayloadStore({
    url: "https://example.supabase.co",
    serviceKey: "service-role-key",
    bucket: "terminal-raw",
    request: async (path, init) => {
      calls.push({ path, init });
      return { ok: true };
    },
  });
  const rawPayload = { id: "fed:release:2026-05-07", title: "Federal Reserve statement" };
  const document = await store.put({
    sourceId: "federal-reserve-rss",
    sourceClass: "official",
    externalId: "fed:release:2026-05-07",
    fetchedAt: NOW,
    publishedAt: "2026-05-07T10:30:00.000Z",
    adapterVersion: "federal-reserve-rss@fixture-v1",
    rawPayload,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, `/storage/v1/object/terminal-raw/${document.rawBlobKey}`);
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.headers.Authorization, "Bearer service-role-key");
  assert.equal(calls[0]?.init.headers.apikey, "service-role-key");
  assert.equal(calls[0]?.init.headers["Content-Type"], "application/json");
  assert.equal(calls[0]?.init.headers["x-upsert"], "false");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    document,
    payload: rawPayload,
    storedAt: NOW,
  });

  assert.deepEqual(supabaseRawPayloadStoreConfigFromEnv({
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SOLVOL_RAW_STORAGE_BUCKET: "terminal-raw",
  }), {
    url: "https://example.supabase.co",
    serviceKey: "service-role-key",
    bucket: "terminal-raw",
  });
  assert.equal(supabaseRawPayloadStoreConfigFromEnv({}), null);
});

test("terminal ingestion runner degrades failed sources without committing cursors", async () => {
  const cursorStore = createInMemoryTerminalCursorStore({
    "gdelt-doc": { sinceIso: "2026-05-07T10:00:00.000Z" },
  });
  const failingAdapter: SourceAdapter<unknown> = {
    sourceId: "gdelt-doc",
    sourceClass: "news_api",
    async fetchBatch() {
      throw Object.assign(new Error("upstream 429"), {
        status: 429,
        rateLimitRemaining: 0,
        rateLimitResetAt: "2026-05-07T12:05:00.000Z",
      });
    },
    async normalize() {
      throw new Error("normalize should not run");
    },
    buildExternalId() {
      return "gdelt-failed";
    },
    buildIdempotencyKey() {
      return "gdelt-failed";
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return {
        sourceId: "gdelt-doc",
        sourceClass: "news_api",
        health: "degraded",
        consecutiveFailures: 2,
        lastAttemptAt: NOW,
      };
    },
  };

  const result = await runTerminalIngestionBridge({
    adapters: [failingAdapter],
    markets: [],
    cursorStore,
    now: NOW,
    persist: async (artifacts) => ({
      persisted: true,
      rows: countPersistenceRows(buildIngestionBridgePersistenceRows(artifacts)),
    }),
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.health.health, "failing");
  assert.equal(result.sources[0]?.health.consecutiveFailures, 3);
  assert.equal(result.sources[0]?.health.lastError, "upstream 429");
  assert.equal(result.sources[0]?.health.lastHttpStatus, 429);
  assert.equal(result.sources[0]?.health.rateLimitRemaining, 0);
  assert.equal(result.sources[0]?.health.rateLimitResetAt, "2026-05-07T12:05:00.000Z");
  assert.equal(result.artifacts.newsItems.length, 0);
  assert.deepEqual(cursorStore.getCursor("gdelt-doc"), { sinceIso: "2026-05-07T10:00:00.000Z" });
});

test("terminal operations pause repeatedly failing sources and derive metrics plus DLQ entries", async () => {
  let fetched = false;
  const adapter: SourceAdapter<unknown> = {
    sourceId: "gdelt-doc",
    sourceClass: "news_api",
    async fetchBatch() {
      fetched = true;
      return {
        rawItems: [],
        sourceStatus: {},
      };
    },
    async normalize() {
      return [];
    },
    buildExternalId() {
      return "never";
    },
    buildIdempotencyKey() {
      return "never";
    },
    async healthCheck() {
      return {
        sourceId: "gdelt-doc",
        sourceClass: "news_api",
        health: "failing",
        lastAttemptAt: "2026-05-07T11:59:00.000Z",
        consecutiveFailures: 5,
        lastError: "upstream 429",
        itemsFetchedLastRun: 0,
        itemsAcceptedLastRun: 0,
      } satisfies DataSourceStatus;
    },
  };

  const result = await runTerminalIngestionBridge({
    adapters: [adapter],
    markets: [],
    now: NOW,
    circuitBreaker: {
      failureThreshold: 3,
      pauseSeconds: 300,
    },
    persist: async (artifacts) => ({
      persisted: true,
      rows: countPersistenceRows(buildIngestionBridgePersistenceRows(artifacts)),
    }),
  });
  const metrics = computeTerminalBridgeMetrics(result, { now: NOW });
  const deadLetters = buildTerminalDeadLetterEntries(result, { now: NOW });

  assert.equal(fetched, false);
  assert.equal(result.sources[0]?.health.health, "paused");
  assert.match(result.sources[0]?.health.lastError ?? "", /circuit breaker/i);
  assert.equal(metrics.sources.total, 1);
  assert.equal(metrics.sources.paused, 1);
  assert.equal(metrics.normalization.successRate, 1);
  assert.equal(metrics.replay.deterministicClusterShare, 1);
  assert.deepEqual(deadLetters.map((entry) => entry.sourceId), ["gdelt-doc"]);
  assert.equal(deadLetters[0]?.rawBlobKey, null);
  assert.equal(deadLetters[0]?.replayable, true);
  assert.match(deadLetters[0]?.reason ?? "", /upstream 429/);
});

test("database schema includes ingestion bridge tables without mutating trading surfaces", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const terminalTypes = await readFile("src/lib/terminal/types.ts", "utf8");
  const terminalLib = await readFile("src/lib/terminal/source-registry.ts", "utf8");

  for (const table of [
    "source_registry",
    "source_cursor",
    "raw_document",
    "news_item",
    "event_cluster",
    "event_cluster_member",
    "entity_catalog",
    "market_registry",
    "market_price",
    "why_moved_candidate",
    "delivery_outbox",
  ]) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
  }

  assert.match(schema, /entities_json jsonb not null default '\[\]'::jsonb/);
  assert.match(schema, /alter table public\.market_registry add column if not exists entities_json jsonb not null default '\[\]'::jsonb/);
  assert.match(schema, /insert into storage\.buckets/i);
  assert.match(schema, /terminal-raw/);
  assert.match(schema, /storage\.objects/);
  assert.match(schema, /bucket_id = 'terminal-raw'/);
  assert.match(schema, /name like 'raw\/%'/);
  assert.match(schema, /service_role/);
  assert.match(schema, /text_signature_json jsonb/);
  assert.match(schema, /timeline_json jsonb not null default '\[\]'::jsonb/);
  assert.match(schema, /alter table public\.event_cluster add column if not exists timeline_json jsonb not null default '\[\]'::jsonb/);
  assert.match(schema, /event_market_link_json jsonb not null default '\{\}'::jsonb/);
  assert.match(schema, /alter table public\.why_moved_candidate add column if not exists event_market_link_json jsonb not null default '\{\}'::jsonb/);
  assert.match(schema, /last_http_status integer/);
  assert.match(schema, /rate_limit_remaining integer/);
  assert.match(schema, /rate_limit_reset_at timestamptz/);
  assert.match(schema, /items_fetched_last_run integer/);
  assert.match(schema, /items_accepted_last_run integer/);
  assert.match(schema, /last_error text/);
  assert.match(schema, /alter table public\.source_cursor add column if not exists last_http_status integer/);
  assert.match(schema, /alter table public\.source_cursor add column if not exists rate_limit_remaining integer/);
  assert.match(schema, /alter table public\.source_cursor add column if not exists rate_limit_reset_at timestamptz/);
  assert.match(schema, /alter table public\.source_cursor add column if not exists items_fetched_last_run integer/);
  assert.match(schema, /alter table public\.source_cursor add column if not exists items_accepted_last_run integer/);
  assert.match(schema, /alter table public\.source_cursor add column if not exists last_error text/);

  for (const marker of [
    "export type SourceClass",
    "export type ProvenanceRef",
    "export type NewsItem",
    "export type EventMarketLink",
    "export type WhyMovedCandidate",
    "export type SourceAdapter",
    "export type RawDocument",
  ]) {
    assert.match(terminalTypes, new RegExp(marker));
  }

  assert.doesNotMatch(terminalTypes + terminalLib + schema, /createOrder|postOrder|cancelOrder|privateKey|deposit|withdraw|custody/i);
});

test("terminal API and UI surfaces expose source health, provenance, and why-moved candidates", async () => {
  const sourcesRoute = await readFile("src/app/api/terminal/sources/route.ts", "utf8");
  const whyMovedRoute = await readFile("src/app/api/terminal/why-moved/route.ts", "utf8");
  const replayRoute = await readFile("src/app/api/terminal/replay/route.ts", "utf8");
  const streamRoute = await readFile("src/app/api/terminal/stream/route.ts", "utf8");
  const marketIntelRoute = await readFile("src/app/api/market/[id]/intel/route.ts", "utf8");
  const internalIngest = await readFile("src/lib/context/ingest.ts", "utf8");
  const hook = await readFile("src/hooks/useMarketIntel.ts", "utf8");
  const workspace = await readFile("src/components/terminal/SignalFlowWorkspace.tsx", "utf8");

  assert.match(sourcesRoute, /fetchTerminalSourceHealthSnapshot/);
  assert.match(sourcesRoute, /sourceHealth/);
  assert.match(sourcesRoute, /readOnly:\s*true/);
  assert.match(sourcesRoute, /delete safe\.lastCursor/);
  assert.match(sourcesRoute, /delete safe\.lastError/);
  assert.match(sourcesRoute, /delete safe\.lastHttpStatus/);
  assert.match(sourcesRoute, /delete safe\.rateLimitRemaining/);
  assert.match(sourcesRoute, /delete safe\.rateLimitResetAt/);
  assert.match(whyMovedRoute, /explainWhyMoved/);
  assert.match(whyMovedRoute, /whyMovedCandidates/);
  assert.match(replayRoute, /replayRawPayloadsFromStore/);
  assert.match(replayRoute, /rawBlobKey/);
  assert.match(replayRoute, /readOnly:\s*true/);
  assert.doesNotMatch(replayRoute, /createConfiguredRawPayloadReader/);
  assert.match(replayRoute, /isReplayableRawBlobKey/);
  assert.match(streamRoute, /text\/event-stream/);
  assert.match(streamRoute, /fetchDeliveryOutboxEvents/);
  assert.match(streamRoute, /terminal.bridge_status/);
  assert.match(streamRoute, /readOnly:\s*true/);
  assert.match(marketIntelRoute, /clusterNewsItems/);
  assert.match(marketIntelRoute, /explainWhyMoved/);
  assert.doesNotMatch(marketIntelRoute, /persistIngestionBridgeArtifacts/);
  assert.match(marketIntelRoute, /Market intel GET is read-only/);
  assert.match(marketIntelRoute, /sourceHealth/);
  assert.match(marketIntelRoute, /whyMovedCandidates/);
  assert.match(marketIntelRoute, /persistence/);
  assert.match(internalIngest, /runTerminalIngestionBridge/);
  assert.match(internalIngest, /terminalBridge/);
  assert.match(hook, /sourceHealth\?: DataSourceStatus\[\]/);
  assert.match(hook, /whyMovedCandidates\?: WhyMovedCandidate\[\]/);
  assert.match(hook, /persistence\?: PersistIngestionBridgeResult/);
  assert.match(workspace, /WhyMovedCandidatesPanel/);
  assert.match(workspace, /Source health/);
  assert.match(workspace, /Checksum/);
});

function marketFixture(input: {
  id: string;
  title: string;
  event: string;
  probability: number;
}): Market {
  return {
    id: input.id,
    source: { id: "polymarket", label: "Polymarket", kind: "polymarket", url: "https://polymarket.com" },
    title: input.title,
    category: "Macro",
    event: input.event,
    url: "https://polymarket.com/event/fed-cut",
    description: "Resolves Yes if the Federal Reserve approves a rate cut by the deadline.",
    resolutionRules: "Official Federal Reserve source.",
    outcomes: [
      { id: `${input.id}-yes`, label: "YES", probability: input.probability, price: input.probability },
      { id: `${input.id}-no`, label: "NO", probability: 1 - input.probability, price: 1 - input.probability },
    ],
    probability: input.probability,
    volume24h: 240_000,
    volume7d: 700_000,
    liquidity: 900_000,
    openInterest: null,
    closeTime: "2026-06-30T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: NOW,
    status: "open",
    priceHistory: [
      { timestamp: "2026-05-07T11:35:00.000Z", probability: 0.49 },
      { timestamp: "2026-05-07T12:05:00.000Z", probability: input.probability },
    ],
  };
}
