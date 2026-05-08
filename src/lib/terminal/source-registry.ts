import { createHash } from "node:crypto";
import { normalizeExternalUrl } from "../safe-url.ts";
import type {
  DataSourceStatus,
  FetchCursor,
  RawDocument,
  SourceClass,
  SourceCursorRecord,
  SourceRegistryEntry,
} from "./types";

type RawDocumentInput = {
  sourceId: string;
  sourceClass: SourceClass;
  externalId: string;
  fetchedAt: string;
  publishedAt?: string;
  adapterVersion: string;
  rawPayload: unknown;
};

type IdempotencyInput = {
  sourceId: string;
  externalId?: string | null;
  canonicalUrl?: string | null;
  headline?: string | null;
  observedAt: string;
  publishedAt?: string | null;
};

export const DEFAULT_TERMINAL_SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    sourceId: "polymarket-public",
    sourceClass: "market",
    label: "Polymarket Public Gamma/CLOB/Data",
    enabled: true,
    readOnly: true,
    priority: 1,
    pollIntervalSec: 45,
    adapterVersion: "polymarket-public@read-only-v1",
    baseUrl: "https://gamma-api.polymarket.com",
    rateLimitPerMinute: 120,
  },
  {
    sourceId: "gdelt-doc",
    sourceClass: "news_api",
    label: "GDELT DOC",
    enabled: true,
    readOnly: true,
    priority: 10,
    pollIntervalSec: 180,
    adapterVersion: "gdelt-doc@fixture-v1",
    baseUrl: "https://api.gdeltproject.org/api/v2/doc/doc",
    rateLimitPerMinute: 30,
  },
  {
    sourceId: "sec-rss",
    sourceClass: "official",
    label: "SEC EDGAR/RSS",
    enabled: true,
    readOnly: true,
    priority: 20,
    pollIntervalSec: 300,
    adapterVersion: "sec-rss@fixture-v1",
    baseUrl: "https://www.sec.gov",
    rateLimitPerMinute: 10,
  },
  {
    sourceId: "federal-reserve-rss",
    sourceClass: "official",
    label: "Federal Reserve RSS",
    enabled: true,
    readOnly: true,
    priority: 30,
    pollIntervalSec: 300,
    adapterVersion: "federal-reserve-rss@fixture-v1",
    baseUrl: "https://www.federalreserve.gov",
    rateLimitPerMinute: 20,
  },
  {
    sourceId: "usgs-earthquakes",
    sourceClass: "official",
    label: "USGS Real-Time Earthquakes",
    enabled: true,
    readOnly: true,
    priority: 40,
    pollIntervalSec: 120,
    adapterVersion: "usgs-earthquakes@fixture-v1",
    baseUrl: "https://earthquake.usgs.gov/earthquakes/feed",
    rateLimitPerMinute: 30,
  },
  {
    sourceId: "cisa-rss",
    sourceClass: "official",
    label: "CISA RSS",
    enabled: true,
    readOnly: true,
    priority: 50,
    pollIntervalSec: 300,
    adapterVersion: "cisa-rss@fixture-v1",
    baseUrl: "https://www.cisa.gov/news-events",
    rateLimitPerMinute: 20,
  },
  {
    sourceId: "ethereum-json-rpc",
    sourceClass: "onchain",
    label: "Ethereum JSON-RPC Logs",
    enabled: true,
    readOnly: true,
    priority: 55,
    pollIntervalSec: 120,
    adapterVersion: "ethereum-json-rpc@fixture-v1",
    baseUrl: "https://ethereum.org/developers/docs/apis/json-rpc/",
    rateLimitPerMinute: 30,
  },
  {
    sourceId: "etherscan-indexed",
    sourceClass: "onchain",
    label: "Etherscan Indexed API",
    enabled: false,
    readOnly: true,
    priority: 58,
    pollIntervalSec: 300,
    adapterVersion: "etherscan-indexed@adapter-v1",
    baseUrl: "https://api.etherscan.io/v2/api",
    rateLimitPerMinute: 5,
  },
  {
    sourceId: "coingecko-context",
    sourceClass: "news_api",
    label: "CoinGecko Context",
    enabled: true,
    readOnly: true,
    priority: 60,
    pollIntervalSec: 180,
    adapterVersion: "coingecko-context@fixture-v1",
    baseUrl: "https://api.coingecko.com/api/v3",
    rateLimitPerMinute: 25,
  },
  {
    sourceId: "fema-ipaws-rss",
    sourceClass: "official",
    label: "FEMA IPAWS RSS",
    enabled: false,
    readOnly: true,
    priority: 70,
    pollIntervalSec: 300,
    adapterVersion: "fema-ipaws-rss@adapter-v1",
    baseUrl: "https://www.fema.gov",
    rateLimitPerMinute: 20,
  },
  {
    sourceId: "reddit-oauth",
    sourceClass: "social",
    label: "Reddit OAuth API",
    enabled: false,
    readOnly: true,
    priority: 80,
    pollIntervalSec: 300,
    adapterVersion: "reddit-oauth@adapter-v1",
    baseUrl: "https://oauth.reddit.com",
    rateLimitPerMinute: 60,
  },
  {
    sourceId: "mastodon-public",
    sourceClass: "social",
    label: "Mastodon Public APIs",
    enabled: false,
    readOnly: true,
    priority: 90,
    pollIntervalSec: 300,
    adapterVersion: "mastodon-public@adapter-v1",
    baseUrl: "https://mastodon.social/api/v2",
    rateLimitPerMinute: 30,
  },
  {
    sourceId: "gnews-api",
    sourceClass: "news_api",
    label: "GNews API",
    enabled: false,
    readOnly: true,
    priority: 100,
    pollIntervalSec: 300,
    adapterVersion: "gnews-api@adapter-v1",
    baseUrl: "https://gnews.io/api/v4",
    rateLimitPerMinute: 30,
  },
  {
    sourceId: "mediastack-api",
    sourceClass: "news_api",
    label: "mediastack API",
    enabled: false,
    readOnly: true,
    priority: 110,
    pollIntervalSec: 300,
    adapterVersion: "mediastack-api@adapter-v1",
    baseUrl: "https://api.mediastack.com/v1",
    rateLimitPerMinute: 30,
  },
  {
    sourceId: "fact-check-overlays",
    sourceClass: "factcheck",
    label: "Fact-Check Overlays",
    enabled: false,
    readOnly: true,
    priority: 120,
    pollIntervalSec: 900,
    adapterVersion: "fact-check-overlays@adapter-v1",
    rateLimitPerMinute: 10,
  },
];

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, sortJson(val)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function dayPart(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : new Date(iso).toISOString().slice(0, 10);
}

function timeBucket(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso.slice(0, 16);
  return new Date(parsed).toISOString().slice(0, 16);
}

export function normalizeSourceUrl(raw: string | null | undefined): string | undefined {
  return normalizeExternalUrl(raw);
}

export function buildRawDocumentMetadata(input: RawDocumentInput): RawDocument {
  const rawJson = stableJson(input.rawPayload);
  const checksumSha256 = sha256Hex(rawJson);
  const id = sha256Hex(`${input.sourceId}|${input.externalId}|${checksumSha256}`);
  return {
    id,
    sourceId: input.sourceId,
    sourceClass: input.sourceClass,
    externalId: input.externalId,
    rawBlobKey: `raw/${input.sourceId}/${dayPart(input.fetchedAt)}/${id}.json`,
    checksumSha256,
    fetchedAt: input.fetchedAt,
    publishedAt: input.publishedAt,
    adapterVersion: input.adapterVersion,
    byteLength: Buffer.byteLength(rawJson, "utf8"),
  };
}

export function buildSourceIdempotencyKey(input: IdempotencyInput): string {
  const primary =
    input.externalId?.trim() ||
    normalizeSourceUrl(input.canonicalUrl) ||
    (input.headline ? input.headline.toLowerCase().replace(/\s+/g, " ").trim() : "");
  const bucket = timeBucket(input.publishedAt || input.observedAt);
  return sha256Hex([input.sourceId, primary, bucket].join("|"));
}

export function dataSourceStatusFromRegistry(
  entry: SourceRegistryEntry,
  opts?: Partial<DataSourceStatus>,
): DataSourceStatus {
  return {
    sourceId: entry.sourceId,
    sourceClass: entry.sourceClass,
    health: entry.enabled ? "healthy" : "paused",
    consecutiveFailures: 0,
    ...opts,
  };
}

export function createInMemorySourceStore(entries: SourceRegistryEntry[]) {
  const registry = new Map(entries.map((entry) => [entry.sourceId, Object.freeze({ ...entry })]));
  const rawDocuments = new Map<string, RawDocument>();
  const cursors = new Map<string, SourceCursorRecord>();

  return {
    listRegistry(): SourceRegistryEntry[] {
      return [...registry.values()].map((entry) => ({ ...entry }));
    },
    getRegistryEntry(sourceId: string): SourceRegistryEntry | null {
      const entry = registry.get(sourceId);
      return entry ? { ...entry } : null;
    },
    putRawDocument(document: RawDocument): void {
      if (rawDocuments.has(document.id)) {
        throw new Error(`raw document already exists: ${document.id}`);
      }
      rawDocuments.set(document.id, Object.freeze({ ...document }));
    },
    getRawDocument(id: string): RawDocument | null {
      const document = rawDocuments.get(id);
      return document ? { ...document } : null;
    },
    listRawDocuments(sourceId?: string): RawDocument[] {
      return [...rawDocuments.values()]
        .filter((document) => !sourceId || document.sourceId === sourceId)
        .map((document) => ({ ...document }));
    },
    updateCursor(sourceId: string, cursor: FetchCursor, updatedAt: string): void {
      if (!registry.has(sourceId)) throw new Error(`unknown source: ${sourceId}`);
      cursors.set(sourceId, Object.freeze({ sourceId, cursor: { ...cursor }, updatedAt }));
    },
    getCursor(sourceId: string): SourceCursorRecord | null {
      const record = cursors.get(sourceId);
      return record ? { sourceId: record.sourceId, cursor: { ...record.cursor }, updatedAt: record.updatedAt } : null;
    },
    listStatuses(now = new Date().toISOString()): DataSourceStatus[] {
      return [...registry.values()].map((entry) =>
        dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: now,
          lastSuccessAt: cursors.get(entry.sourceId)?.updatedAt,
          lastCursor: cursors.get(entry.sourceId) ? stableJson(cursors.get(entry.sourceId)!.cursor) : undefined,
          itemsAcceptedLastRun: [...rawDocuments.values()].filter((doc) => doc.sourceId === entry.sourceId).length,
        }),
      );
    },
  };
}
