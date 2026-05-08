export type TerminalOutboxConfig = {
  url: string;
  key: string;
};

export type DeliveryOutboxEvent = {
  seq: number;
  topic: string;
  payload: unknown;
  createdAt: string;
  sentAt: string | null;
};

type DeliveryOutboxRow = {
  seq?: number;
  topic?: string;
  payload_json?: unknown;
  created_at?: string;
  sent_at?: string | null;
};

type OutboxRequest = (
  path: string,
  init: RequestInit & { headers: Record<string, string> },
) => Promise<unknown>;

export type FetchDeliveryOutboxOptions = {
  afterSeq?: number;
  limit?: number;
  config?: TerminalOutboxConfig | null;
  request?: OutboxRequest;
};

export type PublishDeliveryOutboxOptions = FetchDeliveryOutboxOptions & {
  now?: string;
  publish: (event: DeliveryOutboxEvent) => Promise<void> | void;
};

export type PublishDeliveryOutboxResult = {
  fetched: number;
  published: number;
  markedSent: number;
  lastSeq?: number;
};

function cleanUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export function terminalOutboxConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): TerminalOutboxConfig | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: cleanUrl(url), key };
}

function positiveInt(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value ?? fallback), 1), max);
}

function outboxPath(opts: Required<Pick<FetchDeliveryOutboxOptions, "afterSeq" | "limit">>): string {
  const params = new URLSearchParams({
    select: "seq,topic,payload_json,created_at,sent_at",
    sent_at: "is.null",
  });
  if (opts.afterSeq > 0) params.set("seq", `gt.${opts.afterSeq}`);
  params.set("order", "seq.asc");
  params.set("limit", String(opts.limit));
  return `/rest/v1/delivery_outbox?${params.toString()}`;
}

function markSentPath(seqs: number[]): string {
  return `/rest/v1/delivery_outbox?seq=in.(${seqs.join(",")})&sent_at=is.null`;
}

async function defaultOutboxRequest(
  cfg: TerminalOutboxConfig,
  path: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<unknown> {
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Terminal outbox fetch failed: ${res.status}`);
  }
  return res.json().catch(() => []);
}

function rowToEvent(row: DeliveryOutboxRow): DeliveryOutboxEvent | null {
  if (typeof row.seq !== "number" || typeof row.topic !== "string") return null;
  return {
    seq: row.seq,
    topic: row.topic,
    payload: row.payload_json ?? {},
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
  };
}

export async function fetchDeliveryOutboxEvents(
  opts: FetchDeliveryOutboxOptions = {},
): Promise<DeliveryOutboxEvent[]> {
  const cfg = opts.config === undefined ? terminalOutboxConfigFromEnv() : opts.config;
  if (!cfg) return [];
  const afterSeq = Math.max(0, Math.trunc(opts.afterSeq ?? 0));
  const limit = positiveInt(opts.limit, 25, 100);
  const path = outboxPath({ afterSeq, limit });
  const request = opts.request ?? ((reqPath, init) => defaultOutboxRequest(cfg, reqPath, init));
  const body = await request(path, {
    method: "GET",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    },
  });
  return Array.isArray(body)
    ? body.map((row) => rowToEvent(row as DeliveryOutboxRow)).filter((event): event is DeliveryOutboxEvent => Boolean(event))
    : [];
}

export function formatSseEvent(event: DeliveryOutboxEvent): string {
  return [
    `id: ${event.seq}`,
    `event: ${event.topic}`,
    `data: ${JSON.stringify(event.payload)}`,
    "",
    "",
  ].join("\n");
}

export async function publishDeliveryOutboxEvents(
  opts: PublishDeliveryOutboxOptions,
): Promise<PublishDeliveryOutboxResult> {
  const cfg = opts.config === undefined ? terminalOutboxConfigFromEnv() : opts.config;
  if (!cfg) return { fetched: 0, published: 0, markedSent: 0 };
  const request = opts.request ?? ((reqPath, init) => defaultOutboxRequest(cfg, reqPath, init));
  const events = await fetchDeliveryOutboxEvents({
    afterSeq: opts.afterSeq,
    limit: opts.limit,
    config: cfg,
    request,
  });
  if (events.length === 0) return { fetched: 0, published: 0, markedSent: 0 };

  for (const event of events) {
    await opts.publish(event);
  }

  const seqs = events.map((event) => event.seq);
  await request(markSentPath(seqs), {
    method: "PATCH",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sent_at: opts.now ?? new Date().toISOString() }),
  });

  return {
    fetched: events.length,
    published: events.length,
    markedSent: events.length,
    lastSeq: seqs.at(-1),
  };
}
