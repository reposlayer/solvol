import type {
  DataSourceStatus,
  SourceClass,
  SourceRegistryEntry,
} from "./types";
import {
  DEFAULT_TERMINAL_SOURCE_REGISTRY,
  createInMemorySourceStore,
  dataSourceStatusFromRegistry,
  stableJson,
} from "./source-registry.ts";

export type TerminalSourceHealthConfig = {
  url: string;
  serviceKey: string;
};

export type TerminalSourceHealthSnapshot = {
  checkedAt: string;
  mode: "durable" | "fallback";
  registry: SourceRegistryEntry[];
  sourceHealth: DataSourceStatus[];
  error?: string;
};

export type TerminalSourceHealthRequest = (
  path: string,
  init: RequestInit & { headers: Record<string, string> },
) => Promise<unknown>;

type SourceRegistryRow = {
  source_id?: unknown;
  source_class?: unknown;
  label?: unknown;
  enabled?: unknown;
  read_only?: unknown;
  priority?: unknown;
  poll_interval_sec?: unknown;
  adapter_version?: unknown;
  base_url?: unknown;
  rate_limit_per_minute?: unknown;
};

type SourceCursorRow = {
  source_id?: unknown;
  cursor_json?: unknown;
  last_success_at?: unknown;
  last_attempt_at?: unknown;
  last_http_status?: unknown;
  rate_limit_remaining?: unknown;
  rate_limit_reset_at?: unknown;
  consecutive_failures?: unknown;
  items_fetched_last_run?: unknown;
  items_accepted_last_run?: unknown;
  last_error?: unknown;
};

function cleanUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isSourceClass(value: unknown): value is SourceClass {
  return (
    value === "market" ||
    value === "official" ||
    value === "news_api" ||
    value === "rss" ||
    value === "social" ||
    value === "onchain" ||
    value === "factcheck"
  );
}

function fallbackSnapshot(checkedAt: string, error?: string): TerminalSourceHealthSnapshot {
  const store = createInMemorySourceStore(DEFAULT_TERMINAL_SOURCE_REGISTRY);
  return {
    checkedAt,
    mode: "fallback",
    registry: DEFAULT_TERMINAL_SOURCE_REGISTRY,
    sourceHealth: store.listStatuses(checkedAt),
    ...(error ? { error } : {}),
  };
}

function registryRowsFromPayload(payload: unknown): SourceRegistryEntry[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row): SourceRegistryEntry[] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as SourceRegistryRow;
    const sourceId = asString(item.source_id);
    const sourceClass = isSourceClass(item.source_class) ? item.source_class : undefined;
    const label = asString(item.label);
    const adapterVersion = asString(item.adapter_version);
    if (!sourceId || !sourceClass || !label || !adapterVersion) return [];
    return [{
      sourceId,
      sourceClass,
      label,
      enabled: asBoolean(item.enabled) ?? true,
      readOnly: true,
      priority: asNumber(item.priority) ?? 100,
      pollIntervalSec: asNumber(item.poll_interval_sec) ?? 300,
      adapterVersion,
      baseUrl: asString(item.base_url),
      rateLimitPerMinute: asNumber(item.rate_limit_per_minute),
    }];
  });
}

function cursorRowsFromPayload(payload: unknown): Map<string, SourceCursorRow> {
  const rows = new Map<string, SourceCursorRow>();
  if (!Array.isArray(payload)) return rows;
  for (const row of payload) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const sourceId = asString((row as SourceCursorRow).source_id);
    if (sourceId) rows.set(sourceId, row as SourceCursorRow);
  }
  return rows;
}

function secondsBetween(now: string, then: string | undefined): number | undefined {
  if (!then) return undefined;
  const nowMs = Date.parse(now);
  const thenMs = Date.parse(then);
  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) return undefined;
  return Math.max(0, Math.round((nowMs - thenMs) / 1000));
}

function healthFromFailures(failures: number): DataSourceStatus["health"] {
  if (failures >= 3) return "failing";
  if (failures > 0) return "degraded";
  return "healthy";
}

export function terminalSourceHealthConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): TerminalSourceHealthConfig | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return {
    url: cleanUrl(url),
    serviceKey,
  };
}

async function defaultRequest(
  cfg: TerminalSourceHealthConfig,
  path: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<unknown> {
  const res = await fetch(`${cleanUrl(cfg.url)}${path}`, {
    ...init,
    cache: "no-store",
  });
  if (res.ok) return res.json();
  const body = await res.text().catch(() => "");
  throw new Error(body || `Source health request failed: ${res.status}`);
}

export async function fetchTerminalSourceHealthSnapshot(opts: {
  now?: string;
  config?: TerminalSourceHealthConfig | null;
  request?: TerminalSourceHealthRequest;
} = {}): Promise<TerminalSourceHealthSnapshot> {
  const checkedAt = opts.now ?? new Date().toISOString();
  const config = opts.config === undefined ? terminalSourceHealthConfigFromEnv() : opts.config;
  if (!config) return fallbackSnapshot(checkedAt);

  const request = opts.request ?? ((path, init) => defaultRequest(config, path, init));
  const headers = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
  };

  try {
    const [registryPayload, cursorPayload] = await Promise.all([
      request("/rest/v1/source_registry?select=source_id,source_class,label,enabled,read_only,priority,poll_interval_sec,adapter_version,base_url,rate_limit_per_minute&order=priority.asc", {
        headers,
      }),
      request("/rest/v1/source_cursor?select=source_id,cursor_json,last_success_at,last_attempt_at,last_http_status,rate_limit_remaining,rate_limit_reset_at,consecutive_failures,items_fetched_last_run,items_accepted_last_run,last_error", {
        headers,
      }),
    ]);
    const registry = registryRowsFromPayload(registryPayload);
    if (registry.length === 0) return fallbackSnapshot(checkedAt, "empty durable source registry");

    const cursors = cursorRowsFromPayload(cursorPayload);
    const sourceHealth = registry.map((entry) => {
      const cursor = cursors.get(entry.sourceId);
      const failures = asNumber(cursor?.consecutive_failures) ?? 0;
      const lastSuccessAt = asString(cursor?.last_success_at);
      return dataSourceStatusFromRegistry(entry, {
        health: healthFromFailures(failures),
        lastSuccessAt,
        lastAttemptAt: asString(cursor?.last_attempt_at),
        lastHttpStatus: asNumber(cursor?.last_http_status),
        rateLimitRemaining: asNumber(cursor?.rate_limit_remaining),
        rateLimitResetAt: asString(cursor?.rate_limit_reset_at),
        lagSeconds: secondsBetween(checkedAt, lastSuccessAt),
        lastCursor: cursor?.cursor_json ? stableJson(cursor.cursor_json) : undefined,
        consecutiveFailures: failures,
        itemsFetchedLastRun: asNumber(cursor?.items_fetched_last_run),
        itemsAcceptedLastRun: asNumber(cursor?.items_accepted_last_run),
        lastError: asString(cursor?.last_error),
      });
    });

    return {
      checkedAt,
      mode: "durable",
      registry,
      sourceHealth,
    };
  } catch (error) {
    return fallbackSnapshot(checkedAt, error instanceof Error ? error.message : String(error));
  }
}
