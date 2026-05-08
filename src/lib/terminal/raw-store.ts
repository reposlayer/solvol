import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import type { RawDocument, SourceClass } from "./types";
import { buildRawDocumentMetadata, stableJson } from "./source-registry.ts";

export type RawPayloadInput = {
  sourceId: string;
  sourceClass: SourceClass;
  externalId: string;
  fetchedAt: string;
  publishedAt?: string;
  adapterVersion: string;
  rawPayload: unknown;
};

export type StoredRawPayload = {
  document: RawDocument;
  payload: unknown;
  storedAt: string;
};

export type RawPayloadStore = {
  put(input: RawPayloadInput): Promise<RawDocument>;
};

export type InMemoryRawPayloadStore = RawPayloadStore & {
  get(rawBlobKey: string): StoredRawPayload | null;
  list(sourceId?: string): StoredRawPayload[];
};

export type FileBackedRawPayloadStore = RawPayloadStore & {
  read(rawBlobKey: string): Promise<StoredRawPayload | null>;
};

export type SupabaseRawPayloadStoreConfig = {
  url: string;
  serviceKey: string;
  bucket: string;
  now?: () => string;
  request?: (
    path: string,
    init: RequestInit & { headers: Record<string, string> },
  ) => Promise<unknown>;
};

export type RawPayloadReadableStore = {
  read(rawBlobKey: string): Promise<StoredRawPayload | null>;
};

export type SupabaseRawPayloadStore = RawPayloadStore & RawPayloadReadableStore;

function cloneStored(stored: StoredRawPayload): StoredRawPayload {
  return {
    document: { ...stored.document },
    payload: JSON.parse(stableJson(stored.payload)) as unknown,
    storedAt: stored.storedAt,
  };
}

export function createInMemoryRawPayloadStore(now = () => new Date().toISOString()): InMemoryRawPayloadStore {
  const byKey = new Map<string, StoredRawPayload>();

  return {
    async put(input: RawPayloadInput): Promise<RawDocument> {
      const document = buildRawDocumentMetadata(input);
      const existing = byKey.get(document.rawBlobKey);
      if (existing && existing.document.checksumSha256 !== document.checksumSha256) {
        throw new Error(`raw payload checksum conflict: ${document.rawBlobKey}`);
      }
      if (!existing) {
        byKey.set(document.rawBlobKey, {
          document: { ...document },
          payload: JSON.parse(stableJson(input.rawPayload)) as unknown,
          storedAt: now(),
        });
      }
      return { ...document };
    },
    get(rawBlobKey: string): StoredRawPayload | null {
      const stored = byKey.get(rawBlobKey);
      return stored ? cloneStored(stored) : null;
    },
    list(sourceId?: string): StoredRawPayload[] {
      return [...byKey.values()]
        .filter((stored) => !sourceId || stored.document.sourceId === sourceId)
        .map(cloneStored);
    },
  };
}

function safeObjectPath(rootDir: string, rawBlobKey: string): string {
  const root = normalize(rootDir);
  const full = normalize(join(root, rawBlobKey));
  if (!full.startsWith(root)) throw new Error(`invalid raw blob key: ${rawBlobKey}`);
  return full;
}

export function createFileBackedRawPayloadStore(rootDir: string): FileBackedRawPayloadStore {
  return {
    async put(input: RawPayloadInput): Promise<RawDocument> {
      const document = buildRawDocumentMetadata(input);
      const path = safeObjectPath(rootDir, document.rawBlobKey);
      const body = stableJson({
        document,
        payload: input.rawPayload,
        storedAt: new Date().toISOString(),
      });
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body, "utf8");
      return document;
    },
    async read(rawBlobKey: string): Promise<StoredRawPayload | null> {
      const path = safeObjectPath(rootDir, rawBlobKey);
      try {
        const parsed = JSON.parse(await readFile(path, "utf8")) as StoredRawPayload;
        return parsed;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

function cleanUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function encodeObjectPath(rawBlobKey: string): string {
  return rawBlobKey.split("/").map(encodeURIComponent).join("/");
}

export function supabaseRawPayloadStoreConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): Omit<SupabaseRawPayloadStoreConfig, "request" | "now"> | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  const bucket = env.SOLVOL_RAW_STORAGE_BUCKET ?? env.SUPABASE_RAW_STORAGE_BUCKET ?? "terminal-raw";
  if (!url || !serviceKey) return null;
  return {
    url: cleanUrl(url),
    serviceKey,
    bucket,
  };
}

async function defaultSupabaseStorageRequest(
  cfg: SupabaseRawPayloadStoreConfig,
  path: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<unknown> {
  const res = await fetch(`${cleanUrl(cfg.url)}${path}`, {
    ...init,
    cache: "no-store",
  });
  if (res.ok) return res.json().catch(() => null);
  if (init.method === "GET" && res.status === 404) return null;
  if (res.status === 400 || res.status === 409) {
    const body = await res.text().catch(() => "");
    if (/already exists/i.test(body)) return null;
    throw new Error(body || `Supabase raw storage write failed: ${res.status}`);
  }
  const body = await res.text().catch(() => "");
  throw new Error(body || `Supabase raw storage write failed: ${res.status}`);
}

export function createSupabaseRawPayloadStore(
  cfg: SupabaseRawPayloadStoreConfig,
): SupabaseRawPayloadStore {
  const request = cfg.request ?? ((reqPath, init) => defaultSupabaseStorageRequest(cfg, reqPath, init));
  return {
    async put(input: RawPayloadInput): Promise<RawDocument> {
      const document = buildRawDocumentMetadata(input);
      const storedAt = cfg.now?.() ?? input.fetchedAt;
      const path = `/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodeObjectPath(document.rawBlobKey)}`;
      await request(path, {
        method: "POST",
        headers: {
          apikey: cfg.serviceKey,
          Authorization: `Bearer ${cfg.serviceKey}`,
          "Content-Type": "application/json",
          "x-upsert": "false",
        },
        body: stableJson({
          document,
          payload: input.rawPayload,
          storedAt,
        }),
      });
      return document;
    },
    async read(rawBlobKey: string): Promise<StoredRawPayload | null> {
      const path = `/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodeObjectPath(rawBlobKey)}`;
      const stored = await request(path, {
        method: "GET",
        headers: {
          apikey: cfg.serviceKey,
          Authorization: `Bearer ${cfg.serviceKey}`,
        },
      });
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
      return stored as StoredRawPayload;
    },
  };
}

export function createConfiguredRawPayloadStore(): RawPayloadStore {
  const cfg = supabaseRawPayloadStoreConfigFromEnv();
  return cfg ? createSupabaseRawPayloadStore(cfg) : createInMemoryRawPayloadStore();
}

export function createConfiguredRawPayloadReader(): RawPayloadReadableStore {
  const cfg = supabaseRawPayloadStoreConfigFromEnv();
  return cfg ? createSupabaseRawPayloadStore(cfg) : createFileBackedRawPayloadStore(process.cwd());
}
