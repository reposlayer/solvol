import type {
  DataSourceStatus,
  FetchBatch,
  FetchCursor,
  Market,
  NewsItem,
  RawDocument,
  SourceAdapter,
  SourceRegistryEntry,
} from "./types";
import {
  clusterNewsItems,
  dedupeNewsItems,
  explainWhyMoved,
} from "./source-intelligence.ts";
import {
  DEFAULT_TERMINAL_SOURCE_REGISTRY,
  dataSourceStatusFromRegistry,
  stableJson,
} from "./source-registry.ts";
import {
  detectPriceReactionWindows,
  reconcileMarketRegistry,
  type MarketPriceRecord,
  type MarketRegistryRecord,
} from "./market-registry.ts";
import {
  buildIngestionBridgePersistenceRows,
  persistIngestionBridgeArtifacts,
  type IngestionBridgeArtifacts,
  type PersistIngestionBridgeResult,
} from "./persistence.ts";
import {
  createConfiguredRawPayloadStore,
  type RawPayloadStore,
} from "./raw-store.ts";

export type TerminalCursorStore = {
  getCursor(sourceId: string): FetchCursor | undefined | Promise<FetchCursor | undefined>;
  commitCursor(sourceId: string, cursor: FetchCursor, updatedAt: string): void | Promise<void>;
};

export type TerminalSourceRunResult = {
  sourceId: string;
  health: DataSourceStatus;
  fetched: number;
  accepted: number;
  rawDocuments: number;
  cursorCommitted: boolean;
};

export type TerminalIngestionArtifacts = IngestionBridgeArtifacts & {
  marketRegistry: MarketRegistryRecord[];
  marketPrice: MarketPriceRecord[];
};

export type TerminalIngestionRunResult = {
  sources: TerminalSourceRunResult[];
  artifacts: TerminalIngestionArtifacts;
  persistence: PersistIngestionBridgeResult;
};

export type TerminalIngestionRunOptions = {
  adapters: SourceAdapter<unknown>[];
  markets?: Market[];
  registry?: SourceRegistryEntry[];
  rawStore?: RawPayloadStore;
  cursorStore?: TerminalCursorStore;
  circuitBreaker?: {
    failureThreshold?: number;
    pauseSeconds?: number;
  };
  retry?: {
    maxAttempts?: number;
    backoffMs?: number;
    retryableStatusCodes?: number[];
    sleep?: (ms: number, attempt: number) => Promise<void> | void;
  };
  now?: string;
  persist?: (artifacts: IngestionBridgeArtifacts) => Promise<PersistIngestionBridgeResult>;
  minReactionAbsChange?: number;
};

type PendingCursor = {
  sourceId: string;
  cursor?: FetchCursor;
};

type SupabaseTerminalCursorStoreConfig = {
  url: string;
  serviceKey: string;
};

type SupabaseTerminalCursorStoreRequest = (
  path: string,
  init: RequestInit & {
    headers: Record<string, string>;
    prefer?: string;
  },
) => Promise<unknown>;

type SupabaseTerminalCursorStoreOptions = {
  config: SupabaseTerminalCursorStoreConfig;
  request?: SupabaseTerminalCursorStoreRequest;
};

export function createInMemoryTerminalCursorStore(
  initial: Record<string, FetchCursor> = {},
): TerminalCursorStore {
  const cursors = new Map<string, FetchCursor>(
    Object.entries(initial).map(([sourceId, cursor]) => [sourceId, { ...cursor }]),
  );

  return {
    getCursor(sourceId: string): FetchCursor | undefined {
      const cursor = cursors.get(sourceId);
      return cursor ? { ...cursor } : undefined;
    },
    commitCursor(sourceId: string, cursor: FetchCursor): void {
      cursors.set(sourceId, { ...cursor });
    },
  };
}

function configuredSupabaseCursorStore(
  env: Record<string, string | undefined> = process.env,
): SupabaseTerminalCursorStoreConfig | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return {
    url: url.replace(/\/$/, ""),
    serviceKey,
  };
}

function cursorRequestHeaders(config: SupabaseTerminalCursorStoreConfig): Record<string, string> {
  return {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function defaultSupabaseCursorRequest(
  config: SupabaseTerminalCursorStoreConfig,
  path: string,
  init: RequestInit & {
    headers: Record<string, string>;
    prefer?: string;
  },
): Promise<unknown> {
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Supabase terminal cursor request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function fetchCursorFromJson(value: unknown): FetchCursor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const cursor: FetchCursor = {};
  if (typeof row.after === "string") cursor.after = row.after;
  if (typeof row.page === "number" && Number.isFinite(row.page)) cursor.page = row.page;
  if (typeof row.sinceIso === "string") cursor.sinceIso = row.sinceIso;
  if (typeof row.blockNumber === "number" && Number.isFinite(row.blockNumber)) cursor.blockNumber = row.blockNumber;
  if (typeof row.etag === "string") cursor.etag = row.etag;
  if (typeof row.lastModified === "string") cursor.lastModified = row.lastModified;
  return Object.keys(cursor).length > 0 ? cursor : undefined;
}

export function createSupabaseTerminalCursorStore(
  opts: SupabaseTerminalCursorStoreOptions,
): TerminalCursorStore {
  const request = opts.request ?? ((path, init) => defaultSupabaseCursorRequest(opts.config, path, init));
  return {
    async getCursor(sourceId: string): Promise<FetchCursor | undefined> {
      const payload = await request(
        `/rest/v1/source_cursor?select=cursor_json&source_id=eq.${encodeURIComponent(sourceId)}&limit=1`,
        {
          method: "GET",
          headers: cursorRequestHeaders(opts.config),
        },
      );
      const row = Array.isArray(payload) ? payload[0] : undefined;
      return fetchCursorFromJson(
        row && typeof row === "object" && !Array.isArray(row)
          ? (row as { cursor_json?: unknown }).cursor_json
          : undefined,
      );
    },
    async commitCursor(sourceId: string, cursor: FetchCursor, updatedAt: string): Promise<void> {
      await request("/rest/v1/source_cursor?on_conflict=source_id", {
        method: "POST",
        headers: cursorRequestHeaders(opts.config),
        prefer: "resolution=merge-duplicates",
        body: JSON.stringify([{
          source_id: sourceId,
          cursor_json: cursor,
          last_success_at: updatedAt,
          last_attempt_at: updatedAt,
          consecutive_failures: 0,
          updated_at: updatedAt,
        }]),
      });
    },
  };
}

export function createConfiguredTerminalCursorStore(
  env: Record<string, string | undefined> = process.env,
): TerminalCursorStore {
  const config = configuredSupabaseCursorStore(env);
  return config
    ? createSupabaseTerminalCursorStore({ config })
    : createInMemoryTerminalCursorStore();
}

export function runnableSourceAdapter<R>(adapter: SourceAdapter<R>): SourceAdapter<unknown> {
  return adapter as unknown as SourceAdapter<unknown>;
}

function registryEntry(registry: SourceRegistryEntry[], adapter: SourceAdapter<unknown>): SourceRegistryEntry {
  const entry = registry.find((item) => item.sourceId === adapter.sourceId);
  if (entry) return entry;
  return {
    sourceId: adapter.sourceId,
    sourceClass: adapter.sourceClass,
    label: adapter.sourceId,
    enabled: true,
    readOnly: true,
    priority: 100,
    pollIntervalSec: 300,
    adapterVersion: `${adapter.sourceId}@runtime`,
  };
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorMetadata(error: unknown): Partial<DataSourceStatus> {
  if (!error || typeof error !== "object") return {};
  const record = error as Record<string, unknown>;
  const status = [record.status, record.statusCode, record.httpStatus, record.lastHttpStatus]
    .find((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    ...(status !== undefined ? { lastHttpStatus: status } : {}),
    ...(typeof record.rateLimitRemaining === "number" && Number.isFinite(record.rateLimitRemaining)
      ? { rateLimitRemaining: record.rateLimitRemaining }
      : {}),
    ...(typeof record.rateLimitResetAt === "string" ? { rateLimitResetAt: record.rateLimitResetAt } : {}),
  };
}

function retryableStatusCodes(opts: TerminalIngestionRunOptions["retry"]): Set<number> {
  return new Set(opts?.retryableStatusCodes ?? [408, 425, 429, 500, 502, 503, 504]);
}

function isRetryableFetchError(error: unknown, opts: TerminalIngestionRunOptions["retry"]): boolean {
  const status = errorMetadata(error).lastHttpStatus;
  if (status === undefined) return true;
  if (status >= 500 && status < 600) return true;
  return retryableStatusCodes(opts).has(status);
}

async function sleepForRetry(
  opts: TerminalIngestionRunOptions["retry"],
  ms: number,
  attempt: number,
): Promise<void> {
  if (ms <= 0) return;
  const sleep = opts?.sleep ?? ((delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay)));
  await sleep(ms, attempt);
}

async function fetchBatchWithRetry(
  adapter: SourceAdapter<unknown>,
  cursor: FetchCursor | undefined,
  opts: TerminalIngestionRunOptions["retry"],
): Promise<FetchBatch<unknown>> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 1);
  const baseBackoffMs = Math.max(0, opts?.backoffMs ?? 0);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await adapter.fetchBatch(cursor);
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableFetchError(error, opts)) throw error;
      await sleepForRetry(opts, baseBackoffMs * (2 ** (attempt - 1)), attempt);
    }
  }
  throw new Error("terminal source fetch retry exhausted");
}

function rowCountsFromArtifacts(artifacts: IngestionBridgeArtifacts): PersistIngestionBridgeResult["rows"] {
  const rows = buildIngestionBridgePersistenceRows(artifacts);
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

async function failingStatus(
  adapter: SourceAdapter<unknown>,
  entry: SourceRegistryEntry,
  error: unknown,
  now: string,
): Promise<DataSourceStatus> {
  const checked = await adapter.healthCheck().catch(() => undefined);
  const consecutiveFailures = (checked?.consecutiveFailures ?? 0) + 1;
  const metadata = errorMetadata(error);
  return dataSourceStatusFromRegistry(entry, {
    ...checked,
    ...metadata,
    health: "failing",
    lastAttemptAt: now,
    consecutiveFailures,
    itemsFetchedLastRun: 0,
    itemsAcceptedLastRun: 0,
    lastError: failureMessage(error),
  });
}

export async function runTerminalIngestionBridge(
  opts: TerminalIngestionRunOptions,
): Promise<TerminalIngestionRunResult> {
  const now = opts.now ?? new Date().toISOString();
  const registry = opts.registry ?? DEFAULT_TERMINAL_SOURCE_REGISTRY;
  const rawStore = opts.rawStore ?? createConfiguredRawPayloadStore();
  const cursorStore = opts.cursorStore ?? createConfiguredTerminalCursorStore();
  const sourceResults: TerminalSourceRunResult[] = [];
  const pendingCursors: PendingCursor[] = [];
  const rawDocuments: RawDocument[] = [];
  const newsItems: NewsItem[] = [];

  for (const adapter of opts.adapters) {
    const entry = registryEntry(registry, adapter);
    const cursor = await cursorStore.getCursor(adapter.sourceId);
    const failureThreshold = opts.circuitBreaker?.failureThreshold;

    if (failureThreshold !== undefined) {
      const checked = await adapter.healthCheck().catch(() => undefined);
      if ((checked?.consecutiveFailures ?? 0) >= failureThreshold) {
        const pauseSeconds = opts.circuitBreaker?.pauseSeconds ?? entry.pollIntervalSec;
        const status = dataSourceStatusFromRegistry(entry, {
          ...checked,
          health: "paused",
          lastAttemptAt: now,
          consecutiveFailures: checked?.consecutiveFailures ?? failureThreshold,
          itemsFetchedLastRun: 0,
          itemsAcceptedLastRun: 0,
          lastError: `circuit breaker paused source for ${pauseSeconds}s after ${checked?.consecutiveFailures ?? failureThreshold} failures${checked?.lastError ? `: ${checked.lastError}` : ""}`,
        });
        sourceResults.push({
          sourceId: adapter.sourceId,
          health: status,
          fetched: 0,
          accepted: 0,
          rawDocuments: 0,
          cursorCommitted: false,
        });
        continue;
      }
    }

    try {
      const batch = await fetchBatchWithRetry(adapter, cursor, opts.retry);
      const acceptedBefore = newsItems.length;
      const rawBefore = rawDocuments.length;
      const nextCursor = batch.nextCursor ?? batch.cursor ?? cursor;

      for (const raw of batch.rawItems) {
        const normalized = await adapter.normalize(raw);
        const externalId = adapter.buildExternalId(raw);
        const provenance = normalized.find((item) =>
          item.provenance.some((ref) => ref.externalId === externalId),
        )?.provenance[0] ?? normalized[0]?.provenance[0];
        const document = await rawStore.put({
          sourceId: adapter.sourceId,
          sourceClass: adapter.sourceClass,
          externalId,
          fetchedAt: provenance?.fetchedAt ?? batch.sourceStatus.lastSuccessAt ?? batch.sourceStatus.lastAttemptAt ?? now,
          publishedAt: provenance?.publishedAt,
          adapterVersion: provenance?.adapterVersion ?? entry.adapterVersion,
          rawPayload: raw,
        });
        rawDocuments.push(document);
        newsItems.push(...normalized);
      }

      const accepted = newsItems.length - acceptedBefore;
      const status = dataSourceStatusFromRegistry(entry, {
        ...batch.sourceStatus,
        health: "healthy",
        lastAttemptAt: batch.sourceStatus.lastAttemptAt ?? now,
        lastSuccessAt: batch.sourceStatus.lastSuccessAt ?? now,
        consecutiveFailures: 0,
        itemsFetchedLastRun: batch.rawItems.length,
        itemsAcceptedLastRun: accepted,
        lastCursor: nextCursor ? stableJson(nextCursor) : undefined,
      });

      pendingCursors.push({ sourceId: adapter.sourceId, cursor: nextCursor });
      sourceResults.push({
        sourceId: adapter.sourceId,
        health: status,
        fetched: batch.rawItems.length,
        accepted,
        rawDocuments: rawDocuments.length - rawBefore,
        cursorCommitted: false,
      });
    } catch (error) {
      const health = await failingStatus(adapter, entry, error, now);
      sourceResults.push({
        sourceId: adapter.sourceId,
        health,
        fetched: 0,
        accepted: 0,
        rawDocuments: 0,
        cursorCommitted: false,
      });
    }
  }

  const normalizedNews = dedupeNewsItems(newsItems);
  const eventClusters = clusterNewsItems(normalizedNews, { now });
  const marketReconciliation = reconcileMarketRegistry(opts.markets ?? []);
  const reactionWindows = (opts.markets ?? []).flatMap((market) =>
    detectPriceReactionWindows(market, {
      minAbsChange: opts.minReactionAbsChange ?? 0.0025,
    }),
  );
  const whyMovedCandidates = (opts.markets ?? []).flatMap((market) =>
    explainWhyMoved({
      market,
      events: eventClusters,
      moves: reactionWindows.filter((move) => move.marketId === market.id),
      createdAt: now,
    }),
  );

  const persistenceArtifacts: IngestionBridgeArtifacts = {
    registry,
    sourceHealth: sourceResults.map((result) => result.health),
    rawDocuments,
    newsItems: normalizedNews,
    eventClusters,
    markets: marketReconciliation.registry,
    priceRecords: marketReconciliation.priceRecords,
    whyMovedCandidates,
    now,
  };

  let persistenceFailed = false;
  const persistence = await (opts.persist ?? persistIngestionBridgeArtifacts)(persistenceArtifacts).catch((error: unknown) => {
    persistenceFailed = true;
    return {
      persisted: false,
      skippedReason: failureMessage(error),
      rows: rowCountsFromArtifacts(persistenceArtifacts),
    };
  });

  if (!persistenceFailed) {
    for (const pending of pendingCursors) {
      if (!pending.cursor) continue;
      await cursorStore.commitCursor(pending.sourceId, pending.cursor, now);
      const source = sourceResults.find((result) => result.sourceId === pending.sourceId);
      if (source) source.cursorCommitted = true;
    }
  }

  return {
    sources: sourceResults,
    artifacts: {
      ...persistenceArtifacts,
      marketRegistry: marketReconciliation.registry,
      marketPrice: marketReconciliation.priceRecords,
    },
    persistence,
  };
}
