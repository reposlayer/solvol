import type {
  AlertEvent,
  AlertRule,
  CatalystRunRecord,
  PlanTier,
  ResearchNote,
  ResearchUser,
  SavedMarket,
  SavedReport,
  SavedScan,
  SourceLedgerEntry,
  WorkspaceLayout,
} from "@/lib/research/types";

type SupabaseUserResponse = {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string; name?: string } | null;
};

export type SupabaseConfig = {
  url: string;
  serviceKey: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

export function supabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export class ResearchStoreError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

async function supabaseRequest<T>(
  path: string,
  init?: RequestInit & { prefer?: string },
): Promise<T> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new ResearchStoreError("Supabase is not configured", 503);
  }
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      "Content-Type": "application/json",
      ...(init?.prefer ? { Prefer: init.prefer } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ResearchStoreError(body || `Supabase request failed: ${res.status}`, res.status);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  return sp.toString();
}

function mapPlan(value: unknown): PlanTier {
  return value === "pro" || value === "team" ? value : "free";
}

export async function userFromRequest(request: Request): Promise<ResearchUser> {
  const cfg = getSupabaseConfig();
  const fallback: ResearchUser = {
    id: process.env.SOLVOL_DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001",
    email: "demo@solvol.local",
    displayName: "Research Demo",
    plan: "pro",
    teamId: null,
    isDemo: !cfg,
  };
  if (!cfg) return fallback;

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    if (process.env.SUPABASE_REQUIRE_AUTH === "true") {
      throw new ResearchStoreError("Authentication required", 401);
    }
    return { ...fallback, isDemo: true };
  }

  const userRes = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!userRes.ok) {
    throw new ResearchStoreError("Invalid Supabase auth token", 401);
  }
  const authUser = (await userRes.json()) as SupabaseUserResponse;
  const profile = await ensureProfile({
    id: authUser.id,
    email: authUser.email ?? null,
    displayName: authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null,
  });
  return profile;
}

export async function ensureProfile(input: {
  id: string;
  email: string | null;
  displayName: string | null;
}): Promise<ResearchUser> {
  type Row = {
    id: string;
    email: string | null;
    display_name: string | null;
    plan: string;
    team_id: string | null;
  };
  const rows = await supabaseRequest<Row[]>(
    `/rest/v1/profiles?${qs({ select: "id,email,display_name,plan,team_id", id: `eq.${input.id}` })}`,
  );
  if (!rows[0]) {
    const inserted = await supabaseRequest<Row[]>("/rest/v1/profiles", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({
        id: input.id,
        email: input.email,
        display_name: input.displayName,
        plan: "free",
      }),
    });
    const row = inserted[0]!;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      plan: mapPlan(row.plan),
      teamId: row.team_id,
      isDemo: false,
    };
  }
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    plan: mapPlan(row.plan),
    teamId: row.team_id,
    isDemo: false,
  };
}

function fromSavedMarket(row: Record<string, unknown>): SavedMarket {
  return {
    id: String(row.id),
    marketId: String(row.market_id),
    marketTitle: typeof row.market_title === "string" ? row.market_title : null,
    folder: typeof row.folder === "string" ? row.folder : "Inbox",
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    thesis: typeof row.thesis === "string" ? row.thesis : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function fromNote(row: Record<string, unknown>): ResearchNote {
  return {
    id: String(row.id),
    marketId: typeof row.market_id === "string" ? row.market_id : null,
    title: String(row.title ?? "Desk note"),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function fromAlert(row: Record<string, unknown>): AlertRule {
  return {
    id: String(row.id),
    marketId: typeof row.market_id === "string" ? row.market_id : null,
    name: String(row.name),
    kind: row.kind as AlertRule["kind"],
    threshold: typeof row.threshold === "number" ? row.threshold : row.threshold == null ? null : Number(row.threshold),
    channel: "in_app_email",
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function fromAlertEvent(row: Record<string, unknown>): AlertEvent {
  return {
    id: String(row.id),
    alertId: typeof row.alert_id === "string" ? row.alert_id : null,
    marketId: typeof row.market_id === "string" ? row.market_id : null,
    title: String(row.title),
    body: String(row.body),
    severity: row.severity === "critical" || row.severity === "warning" ? row.severity : "info",
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: String(row.created_at),
  };
}

function fromLedger(row: Record<string, unknown>): SourceLedgerEntry {
  return {
    id: String(row.id),
    catalystRunId: typeof row.catalyst_run_id === "string" ? row.catalyst_run_id : null,
    marketId: String(row.market_id),
    sourceType: String(row.source_type),
    title: String(row.title),
    url: typeof row.url === "string" ? row.url : null,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    retrievedAt: String(row.retrieved_at),
    entityMatches: Array.isArray(row.entity_matches) ? row.entity_matches.map(String) : [],
    confidence: Number(row.confidence ?? 0),
    direction: String(row.direction ?? "unclear"),
    evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [],
  };
}

function fromReport(row: Record<string, unknown>): SavedReport {
  return {
    id: String(row.id),
    title: String(row.title),
    marketIds: Array.isArray(row.market_ids) ? row.market_ids.map(String) : [],
    bodyMd: String(row.body_md ?? ""),
    shareToken: typeof row.share_token === "string" ? row.share_token : null,
    isPublic: Boolean(row.is_public),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getWorkspace(user: ResearchUser) {
  if (!supabaseConfigured()) {
    return {
      watchlist: [],
      savedMarkets: [],
      notes: [],
      savedScans: [],
      layouts: [],
    };
  }

  const [watchlists, savedMarkets, notes, savedScans, layouts] = await Promise.all([
    supabaseRequest<Array<{ market_ids?: string[] }>>(
      `/rest/v1/watchlists?${qs({ select: "market_ids", user_id: `eq.${user.id}`, order: "updated_at.desc", limit: 1 })}`,
    ),
    supabaseRequest<Record<string, unknown>[]>(
      `/rest/v1/saved_markets?${qs({ select: "*", user_id: `eq.${user.id}`, order: "updated_at.desc", limit: 100 })}`,
    ),
    supabaseRequest<Record<string, unknown>[]>(
      `/rest/v1/notes?${qs({ select: "*", user_id: `eq.${user.id}`, order: "updated_at.desc", limit: 100 })}`,
    ),
    supabaseRequest<Array<{ id: string; name: string; lane: string; filters: Record<string, unknown>; created_at: string }>>(
      `/rest/v1/saved_scans?${qs({ select: "*", user_id: `eq.${user.id}`, order: "created_at.desc", limit: 50 })}`,
    ),
    supabaseRequest<Array<{ id: string; name: string; layout: Record<string, unknown>; updated_at: string }>>(
      `/rest/v1/workspace_layouts?${qs({ select: "*", user_id: `eq.${user.id}`, order: "updated_at.desc", limit: 20 })}`,
    ),
  ]);

  return {
    watchlist: watchlists[0]?.market_ids ?? [],
    savedMarkets: savedMarkets.map(fromSavedMarket),
    notes: notes.map(fromNote),
    savedScans: savedScans.map((row): SavedScan => ({
      id: row.id,
      name: row.name,
      lane: row.lane,
      filters: row.filters ?? {},
      createdAt: row.created_at,
    })),
    layouts: layouts.map((row): WorkspaceLayout => ({
      id: row.id,
      name: row.name,
      layout: row.layout ?? {},
      updatedAt: row.updated_at,
    })),
  };
}

export async function saveWorkspacePatch(
  user: ResearchUser,
  patch: {
    watchlist?: string[];
    savedMarket?: { marketId: string; marketTitle?: string | null; folder?: string; tags?: string[]; thesis?: string | null };
    note?: { marketId?: string | null; title?: string; body: string };
    savedScan?: { name: string; lane: string; filters?: Record<string, unknown> };
    layout?: { name: string; layout: Record<string, unknown> };
  },
) {
  if (!supabaseConfigured()) return { ok: true, persisted: false };

  const ops: Promise<unknown>[] = [];
  if (patch.watchlist) {
    ops.push(
      supabaseRequest("/rest/v1/watchlists", {
        method: "POST",
        prefer: "resolution=merge-duplicates",
        body: JSON.stringify({
          user_id: user.id,
          team_id: user.teamId,
          name: "Research Desk",
          market_ids: patch.watchlist.slice(0, 500),
          updated_at: new Date().toISOString(),
        }),
      }),
    );
  }
  if (patch.savedMarket) {
    ops.push(
      supabaseRequest("/rest/v1/saved_markets", {
        method: "POST",
        prefer: "resolution=merge-duplicates",
        body: JSON.stringify({
          user_id: user.id,
          team_id: user.teamId,
          market_id: patch.savedMarket.marketId,
          market_title: patch.savedMarket.marketTitle ?? null,
          folder: patch.savedMarket.folder ?? "Inbox",
          tags: patch.savedMarket.tags ?? [],
          thesis: patch.savedMarket.thesis ?? null,
          updated_at: new Date().toISOString(),
        }),
      }),
    );
  }
  if (patch.note) {
    ops.push(
      supabaseRequest("/rest/v1/notes", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          team_id: user.teamId,
          market_id: patch.note.marketId ?? null,
          title: patch.note.title ?? "Desk note",
          body: patch.note.body,
        }),
      }),
    );
  }
  if (patch.savedScan) {
    ops.push(
      supabaseRequest("/rest/v1/saved_scans", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          team_id: user.teamId,
          name: patch.savedScan.name,
          lane: patch.savedScan.lane,
          filters: patch.savedScan.filters ?? {},
        }),
      }),
    );
  }
  if (patch.layout) {
    ops.push(
      supabaseRequest("/rest/v1/workspace_layouts", {
        method: "POST",
        prefer: "resolution=merge-duplicates",
        body: JSON.stringify({
          user_id: user.id,
          team_id: user.teamId,
          name: patch.layout.name,
          layout: patch.layout.layout,
          updated_at: new Date().toISOString(),
        }),
      }),
    );
  }
  await Promise.all(ops);
  return { ok: true, persisted: true };
}

export async function listAlerts(user: ResearchUser) {
  if (!supabaseConfigured()) return { alerts: [] as AlertRule[], events: [] as AlertEvent[] };
  const [alerts, events] = await Promise.all([
    supabaseRequest<Record<string, unknown>[]>(
      `/rest/v1/alerts?${qs({ select: "*", user_id: `eq.${user.id}`, order: "updated_at.desc", limit: 100 })}`,
    ),
    supabaseRequest<Record<string, unknown>[]>(
      `/rest/v1/alert_events?${qs({ select: "*", user_id: `eq.${user.id}`, order: "created_at.desc", limit: 100 })}`,
    ),
  ]);
  return { alerts: alerts.map(fromAlert), events: events.map(fromAlertEvent) };
}

export async function createAlert(
  user: ResearchUser,
  input: { marketId?: string | null; name: string; kind: AlertRule["kind"]; threshold?: number | null },
) {
  if (!supabaseConfigured()) return { ok: true, persisted: false };
  const rows = await supabaseRequest<Record<string, unknown>[]>("/rest/v1/alerts", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      user_id: user.id,
      team_id: user.teamId,
      market_id: input.marketId ?? null,
      name: input.name,
      kind: input.kind,
      threshold: input.threshold ?? null,
      channel: "in_app_email",
      enabled: true,
    }),
  });
  return { ok: true, persisted: true, alert: rows[0] ? fromAlert(rows[0]) : null };
}

export async function listLedger(user: ResearchUser, marketId?: string | null) {
  if (!supabaseConfigured()) return [] as SourceLedgerEntry[];
  const query: Record<string, string | number | boolean | undefined> = {
    select: "*",
    user_id: user.isDemo ? "is.null" : `eq.${user.id}`,
    order: "created_at.desc",
    limit: 120,
  };
  if (marketId) query.market_id = `eq.${marketId}`;
  const rows = await supabaseRequest<Record<string, unknown>[]>(`/rest/v1/source_ledger_entries?${qs(query)}`);
  return rows.map(fromLedger);
}

export async function persistCatalystRun(
  result: import("@/lib/domain/types").MarketMoveExplanation,
  user?: ResearchUser | null,
): Promise<CatalystRunRecord | null> {
  if (!supabaseConfigured()) return null;
  const rows = await supabaseRequest<Record<string, unknown>[]>("/rest/v1/catalyst_runs", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      user_id: user?.isDemo ? null : user?.id ?? null,
      team_id: user?.teamId ?? null,
      market_id: result.marketId,
      market_title: result.marketTitle,
      confidence: result.confidence,
      confidence_band: result.confidenceBand,
      move_percent: result.movePercent,
      explanation: result.explanation,
      payload: result,
    }),
  });
  const runId = String(rows[0]?.id ?? "");
  if (runId) {
    await supabaseRequest("/rest/v1/source_ledger_entries", {
      method: "POST",
      body: JSON.stringify(
        result.likelyCatalysts.flatMap((catalyst) => ({
          catalyst_run_id: runId,
          user_id: user?.isDemo ? null : user?.id ?? null,
          market_id: result.marketId,
          source_type: catalyst.source,
          title: catalyst.title,
          url: catalyst.sourceUrl ?? null,
          published_at: catalyst.timestamp,
          retrieved_at: catalyst.retrievedAt,
          entity_matches: catalyst.affectedEntities,
          confidence: catalyst.confidence,
          direction: catalyst.direction,
          evidence: catalyst.evidence,
          metadata: { scoringBreakdown: catalyst.scoringBreakdown, summary: catalyst.summary },
        })),
      ),
    });
  }
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    marketId: String(row.market_id),
    marketTitle: String(row.market_title),
    confidence: Number(row.confidence),
    confidenceBand: String(row.confidence_band),
    movePercent: Number(row.move_percent),
    explanation: String(row.explanation),
    payload: row.payload as CatalystRunRecord["payload"],
    createdAt: String(row.created_at),
  };
}

export async function listReports(user: ResearchUser) {
  if (!supabaseConfigured()) return [] as SavedReport[];
  const rows = await supabaseRequest<Record<string, unknown>[]>(
    `/rest/v1/reports?${qs({ select: "*", user_id: `eq.${user.id}`, order: "updated_at.desc", limit: 100 })}`,
  );
  return rows.map(fromReport);
}

export async function createReport(
  user: ResearchUser,
  input: { title: string; marketIds: string[]; bodyMd: string; isPublic?: boolean },
) {
  if (!supabaseConfigured()) return { ok: true, persisted: false };
  const rows = await supabaseRequest<Record<string, unknown>[]>("/rest/v1/reports", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      user_id: user.id,
      team_id: user.teamId,
      title: input.title,
      market_ids: input.marketIds,
      body_md: input.bodyMd,
      is_public: input.isPublic ?? false,
    }),
  });
  return { ok: true, persisted: true, report: rows[0] ? fromReport(rows[0]) : null };
}

export async function getSharedReport(token: string) {
  if (!supabaseConfigured()) return null;
  const rows = await supabaseRequest<Record<string, unknown>[]>(
    `/rest/v1/reports?${qs({ select: "*", share_token: `eq.${token}`, is_public: "eq.true", limit: 1 })}`,
  );
  return rows[0] ? fromReport(rows[0]) : null;
}
