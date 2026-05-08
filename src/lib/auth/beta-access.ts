export type BetaAccessStatus =
  | "demo"
  | "unauthenticated"
  | "invited"
  | "accepted"
  | "revoked"
  | "waitlisted"
  | "denied"
  | "unconfigured";

export type BetaPlanTier = "free" | "beta" | "pro" | "team";

export type SupabaseServiceConfig = {
  url: string;
  serviceKey: string;
};

export type BetaInviteRow = {
  id: string;
  email: string;
  status: "invited" | "accepted" | "revoked";
  invited_by: string | null;
  invited_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  notes: string | null;
};

export type BetaProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: BetaPlanTier;
  team_id: string | null;
};

export type AcceptedBetaUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  plan: BetaPlanTier;
  teamId: string | null;
  isDemo: false;
  accessStatus: BetaAccessStatus;
};

type AuthUserInput = {
  id: string;
  email: string | null;
  displayName?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROTECTED_PAGE_PREFIXES = ["/terminal", "/market", "/tools/why-move"];
const PROTECTED_API_PREFIXES = ["/api/research", "/api/explain", "/api/discovery", "/api/market", "/api/terminal"];

export function normalizeInviteEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_RE.test(normalized)) return null;
  return normalized;
}

export function authRequired(): boolean {
  return process.env.SUPABASE_REQUIRE_AUTH === "true";
}

export function planAllowsBetaAccess(plan: string | null | undefined): plan is Exclude<BetaPlanTier, "free"> {
  return plan === "beta" || plan === "pro" || plan === "team";
}

function pathnameFrom(input: string): string {
  try {
    const url = input.startsWith("http") ? new URL(input) : new URL(input, "https://solvol.local");
    return url.pathname;
  } catch {
    return input.split("?")[0] || "/";
  }
}

export function isProtectedPagePath(input: string): boolean {
  const pathname = pathnameFrom(input);
  return PROTECTED_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isProtectedApiPath(input: string): boolean {
  const pathname = pathnameFrom(input);
  return PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function buildAuthRedirect(input: string): string {
  try {
    const url = input.startsWith("http") ? new URL(input) : new URL(input, "https://solvol.local");
    const returnPath = `${url.pathname}${url.search}`;
    if (!isProtectedPagePath(returnPath)) return "/login";
    return `/login?next=${encodeURIComponent(returnPath)}`;
  } catch {
    return "/login";
  }
}

export function safeReturnPath(value: string | null | undefined, fallback = "/terminal"): string {
  if (!value) return fallback;
  try {
    const url = new URL(value, "https://solvol.local");
    const path = `${url.pathname}${url.search}`;
    return isProtectedPagePath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}

export function getSupabaseServiceConfig(): SupabaseServiceConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

export function serviceConfigured(): boolean {
  return getSupabaseServiceConfig() !== null;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  return sp.toString();
}

export async function supabaseServiceRequest<T>(
  path: string,
  init?: RequestInit & { prefer?: string },
): Promise<T> {
  const cfg = getSupabaseServiceConfig();
  if (!cfg) throw new Error("Supabase service role is not configured");
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
    throw new Error(body || `Supabase service request failed: ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export async function findBetaInviteByEmail(email: string): Promise<BetaInviteRow | null> {
  const normalized = normalizeInviteEmail(email);
  if (!normalized) return null;
  const rows = await supabaseServiceRequest<BetaInviteRow[]>(
    `/rest/v1/beta_invites?${qs({ select: "*", email: `eq.${normalized}`, limit: 1 })}`,
  );
  return rows[0] ?? null;
}

async function findProfileById(id: string): Promise<BetaProfileRow | null> {
  const rows = await supabaseServiceRequest<BetaProfileRow[]>(
    `/rest/v1/profiles?${qs({ select: "id,email,display_name,plan,team_id", id: `eq.${id}`, limit: 1 })}`,
  );
  return rows[0] ?? null;
}

function mapPlan(value: unknown): BetaPlanTier {
  return value === "beta" || value === "pro" || value === "team" ? value : "free";
}

export async function upsertBetaProfile(input: AuthUserInput): Promise<AcceptedBetaUser> {
  const current = await findProfileById(input.id);
  const plan = planAllowsBetaAccess(current?.plan) ? current.plan : "beta";
  const rows = await supabaseServiceRequest<BetaProfileRow[]>(
    `/rest/v1/profiles?${qs({ on_conflict: "id" })}`,
    {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify({
        id: input.id,
        email: input.email,
        display_name: input.displayName ?? current?.display_name ?? null,
        plan,
        team_id: current?.team_id ?? null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  const row = rows[0] ?? current;
  return {
    id: input.id,
    email: row?.email ?? input.email,
    displayName: row?.display_name ?? input.displayName ?? null,
    plan: mapPlan(row?.plan ?? plan),
    teamId: row?.team_id ?? null,
    isDemo: false,
    accessStatus: "accepted",
  };
}

export async function acceptBetaInviteForUser(
  input: AuthUserInput,
): Promise<{ status: BetaAccessStatus; user: AcceptedBetaUser | null; invite: BetaInviteRow | null }> {
  const email = normalizeInviteEmail(input.email);
  if (!email) return { status: "denied", user: null, invite: null };
  const invite = await findBetaInviteByEmail(email);
  if (!invite) return { status: "waitlisted", user: null, invite: null };
  if (invite.status === "revoked") return { status: "revoked", user: null, invite };

  const user = await upsertBetaProfile({ ...input, email });
  const acceptedAt = new Date().toISOString();
  await supabaseServiceRequest<BetaInviteRow[]>(
    `/rest/v1/beta_invites?${qs({ email: `eq.${email}` })}`,
    {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({
        status: "accepted",
        accepted_by: input.id,
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      }),
    },
  );
  return { status: "accepted", user, invite: { ...invite, status: "accepted", accepted_by: input.id, accepted_at: acceptedAt } };
}

export async function accessStatusForEmail(email: string | null | undefined): Promise<BetaAccessStatus> {
  const normalized = normalizeInviteEmail(email);
  if (!normalized) return "unauthenticated";
  if (!serviceConfigured()) return authRequired() ? "unconfigured" : "demo";
  const invite = await findBetaInviteByEmail(normalized);
  if (!invite) return "waitlisted";
  return invite.status;
}
