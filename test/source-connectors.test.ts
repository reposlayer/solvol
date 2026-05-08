import test from "node:test";
import assert from "node:assert/strict";
import { fetchGdeltArticles, normalizeGdeltArticles } from "../src/lib/context/gdelt.ts";
import { normalizeWikidataSearch } from "../src/lib/context/wikidata.ts";
import { normalizeFredObservations, fredSeriesForTerms } from "../src/lib/context/fred.ts";
import { normalizeAlphaVantageDaily, alphaSymbolsForTerms } from "../src/lib/context/alpha-vantage.ts";
import { sourceDocumentFromArticle } from "../src/lib/context/source-documents.ts";

test("normalizes GDELT article payloads into source documents", () => {
  const docs = normalizeGdeltArticles(
    {
      articles: [
        {
          url: "https://example.com/polls",
          title: "Polling shift in Pennsylvania",
          seendate: "20260501T101500Z",
          sourceCountry: "US",
          domain: "example.com",
          language: "English",
        },
        { title: "missing url" },
      ],
    },
    ["Trump", "Pennsylvania"],
  );

  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.provider, "gdelt");
  assert.equal(docs[0]?.category, "event_graph");
  assert.equal(docs[0]?.externalId, "https://example.com/polls");
  assert.equal(docs[0]?.publishedAt, "2026-05-01T10:15:00.000Z");
  assert.deepEqual(docs[0]?.matchedTerms, ["Trump", "Pennsylvania"]);
  assert.equal(docs[0]?.metadata.domain, "example.com");
});

test("GDELT fetch degrades to empty documents when the upstream request fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    const docs = await fetchGdeltArticles(["Pennsylvania polling"], { limit: 3 });

    assert.deepEqual(docs, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizes Wikidata search results as entity context documents", () => {
  const docs = normalizeWikidataSearch(
    {
      search: [
        {
          id: "Q306",
          title: "Q306",
          label: "Donald Trump",
          description: "45th and 47th president of the United States",
          concepturi: "http://www.wikidata.org/entity/Q306",
        },
        { label: "no id" },
      ],
    },
    "Trump",
  );

  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.provider, "wikidata");
  assert.equal(docs[0]?.category, "entity_context");
  assert.equal(docs[0]?.externalId, "Q306");
  assert.equal(docs[0]?.url, "https://www.wikidata.org/wiki/Q306");
  assert.deepEqual(docs[0]?.matchedTerms, ["Trump"]);
});

test("maps macro terms to FRED series and normalizes observations", () => {
  assert.deepEqual(fredSeriesForTerms(["CPI", "Fed funds", "jobs report"]), [
    "CPIAUCSL",
    "FEDFUNDS",
    "UNRATE",
  ]);

  const docs = normalizeFredObservations(
    "CPIAUCSL",
    {
      observations: [
        { date: "2026-03-01", value: "319.1" },
        { date: "2026-04-01", value: "." },
      ],
    },
    ["CPI"],
  );

  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.provider, "fred");
  assert.equal(docs[0]?.category, "macro");
  assert.equal(docs[0]?.externalId, "CPIAUCSL:2026-03-01");
  assert.equal(docs[0]?.metadata.value, 319.1);
});

test("maps equity terms to Alpha Vantage symbols and normalizes daily candles", () => {
  assert.deepEqual(alphaSymbolsForTerms(["Nvidia", "SPY", "unrelated"]), ["NVDA", "SPY"]);

  const docs = normalizeAlphaVantageDaily(
    "NVDA",
    {
      "Time Series (Daily)": {
        "2026-04-30": {
          "1. open": "870",
          "4. close": "887.12",
          "5. volume": "4512",
        },
      },
    },
    ["Nvidia"],
  );

  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.provider, "alpha_vantage");
  assert.equal(docs[0]?.category, "price_feed");
  assert.equal(docs[0]?.externalId, "NVDA:2026-04-30");
  assert.equal(docs[0]?.metadata.close, 887.12);
});

test("converts existing RSS articles into normalized source documents", () => {
  const doc = sourceDocumentFromArticle({
    id: "Reuters:https://example.com/a:0",
    title: "Fed decision due today",
    link: "https://example.com/a",
    publishedAt: "2026-05-01T08:00:00.000Z",
    feedLabel: "Reuters Top News",
    summary: "Central bank decision",
    matchedTerms: ["Fed"],
    category: "macro",
  });

  assert.equal(doc.provider, "rss");
  assert.equal(doc.category, "news");
  assert.equal(doc.externalId, "Reuters:https://example.com/a:0");
  assert.equal(doc.reliability, 0.88);
  assert.deepEqual(doc.matchedTerms, ["Fed"]);
});
