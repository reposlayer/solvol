import type {
  SourceCategory,
  SourceDocument,
  SourceMatch,
  SourceProvider,
} from "../domain/types";
import { normalizeExternalUrl } from "../safe-url.ts";

export type SourceDocumentRow = {
  id?: string;
  provider: string;
  external_id: string;
  title: string;
  url: string | null;
  published_at: string | null;
  retrieved_at: string;
  summary: string | null;
  category: string;
  matched_terms: string[];
  reliability: number;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type MarketSourceMatchRow = {
  market_id: string;
  provider: string;
  document_external_id: string;
  relevance_score: number;
  matched_terms: string[];
};

const PROVIDERS = new Set(["rss", "gdelt", "coingecko", "wikidata", "fred", "alpha_vantage"]);
const CATEGORIES = new Set([
  "news",
  "event_graph",
  "poll",
  "price_feed",
  "macro",
  "entity_context",
  "sportsbook",
  "social",
  "onchain",
]);

function provider(raw: string): SourceProvider {
  return PROVIDERS.has(raw) ? (raw as SourceProvider) : "rss";
}

function category(raw: string): SourceCategory {
  return CATEGORIES.has(raw) ? (raw as SourceCategory) : "news";
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

function metadata(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function toSourceDocumentRow(doc: SourceDocument): SourceDocumentRow {
  return {
    provider: doc.provider,
    external_id: doc.externalId,
    title: doc.title,
    url: doc.url,
    published_at: doc.publishedAt,
    retrieved_at: doc.retrievedAt,
    summary: doc.summary,
    category: doc.category,
    matched_terms: doc.matchedTerms,
    reliability: doc.reliability,
    metadata: doc.metadata,
  };
}

export function fromSourceDocumentRow(row: Record<string, unknown>): SourceDocument {
  return {
    provider: provider(String(row.provider ?? "rss")),
    externalId: String(row.external_id ?? ""),
    title: String(row.title ?? ""),
    url: normalizeExternalUrl(typeof row.url === "string" ? row.url : null) ?? null,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    retrievedAt: typeof row.retrieved_at === "string" ? row.retrieved_at : new Date().toISOString(),
    summary: typeof row.summary === "string" ? row.summary : null,
    category: category(String(row.category ?? "news")),
    matchedTerms: stringArray(row.matched_terms),
    reliability: Number(row.reliability ?? 0.5),
    metadata: metadata(row.metadata),
    origin: "stored",
  };
}

export function toMarketSourceMatchRow(match: SourceMatch): MarketSourceMatchRow {
  return {
    market_id: match.marketId,
    provider: match.provider,
    document_external_id: match.documentExternalId,
    relevance_score: match.relevanceScore,
    matched_terms: match.matchedTerms ?? [],
  };
}
