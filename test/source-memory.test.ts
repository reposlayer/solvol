import test from "node:test";
import assert from "node:assert/strict";
import { fromSourceDocumentRow, toMarketSourceMatchRow, toSourceDocumentRow } from "../src/lib/research/source-memory.ts";

const doc = {
  provider: "gdelt" as const,
  externalId: "https://example.com/event",
  title: "Event headline",
  url: "https://example.com/event",
  publishedAt: "2026-05-01T10:00:00.000Z",
  retrievedAt: "2026-05-01T10:05:00.000Z",
  summary: "Event summary",
  category: "event_graph" as const,
  matchedTerms: ["Fed", "rates"],
  reliability: 0.76,
  metadata: { domain: "example.com" },
};

test("maps source documents to Supabase rows and back", () => {
  const row = toSourceDocumentRow(doc);

  assert.equal(row.provider, "gdelt");
  assert.equal(row.external_id, "https://example.com/event");
  assert.equal(row.category, "event_graph");
  assert.deepEqual(row.matched_terms, ["Fed", "rates"]);
  assert.deepEqual(row.metadata, { domain: "example.com" });

  const restored = fromSourceDocumentRow({
    ...row,
    id: "uuid",
    created_at: "2026-05-01T10:06:00.000Z",
    updated_at: "2026-05-01T10:06:00.000Z",
  });

  assert.equal(restored.provider, "gdelt");
  assert.equal(restored.origin, "stored");
  assert.equal(restored.externalId, doc.externalId);
});

test("maps market source matches with provider and relevance", () => {
  const row = toMarketSourceMatchRow({
    marketId: "123",
    provider: "rss",
    documentExternalId: "rss:abc",
    relevanceScore: 4,
    matchedTerms: ["CPI"],
  });

  assert.deepEqual(row, {
    market_id: "123",
    provider: "rss",
    document_external_id: "rss:abc",
    relevance_score: 4,
    matched_terms: ["CPI"],
  });
});
