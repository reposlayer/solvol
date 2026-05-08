export type PublicPolymarketApi = "gamma" | "clob" | "data";

type PublicEndpointPath =
  | "/markets"
  | "/markets/{id}"
  | "/events"
  | "/public-search"
  | "/book"
  | "/midpoint"
  | "/spread"
  | "/prices-history"
  | "/trades";

export type PublicPolymarketEndpoint = {
  api: PublicPolymarketApi;
  method: "GET";
  path: PublicEndpointPath;
  readOnly: true;
  requiresAuth: false;
  purpose: string;
};

type UrlParamValue =
  | string
  | number
  | boolean
  | readonly (string | number | boolean)[]
  | null
  | undefined;

export const POLYMARKET_PUBLIC_BASES: Record<PublicPolymarketApi, string> = {
  gamma: "https://gamma-api.polymarket.com",
  clob: "https://clob.polymarket.com",
  data: "https://data-api.polymarket.com",
};

export const POLYMARKET_PUBLIC_ENDPOINTS: PublicPolymarketEndpoint[] = [
  {
    api: "gamma",
    method: "GET",
    path: "/markets",
    readOnly: true,
    requiresAuth: false,
    purpose: "Discover and list active market metadata.",
  },
  {
    api: "gamma",
    method: "GET",
    path: "/markets/{id}",
    readOnly: true,
    requiresAuth: false,
    purpose: "Fetch one market's public metadata and CLOB token IDs.",
  },
  {
    api: "gamma",
    method: "GET",
    path: "/events",
    readOnly: true,
    requiresAuth: false,
    purpose: "Browse active events with their associated markets for complete public discovery.",
  },
  {
    api: "gamma",
    method: "GET",
    path: "/public-search",
    readOnly: true,
    requiresAuth: false,
    purpose: "Search public events, markets, and profiles.",
  },
  {
    api: "clob",
    method: "GET",
    path: "/book",
    readOnly: true,
    requiresAuth: false,
    purpose: "Read public token order book depth.",
  },
  {
    api: "clob",
    method: "GET",
    path: "/midpoint",
    readOnly: true,
    requiresAuth: false,
    purpose: "Read public midpoint probability.",
  },
  {
    api: "clob",
    method: "GET",
    path: "/spread",
    readOnly: true,
    requiresAuth: false,
    purpose: "Read public bid/ask spread.",
  },
  {
    api: "clob",
    method: "GET",
    path: "/prices-history",
    readOnly: true,
    requiresAuth: false,
    purpose: "Read public price history for a CLOB asset.",
  },
  {
    api: "data",
    method: "GET",
    path: "/trades",
    readOnly: true,
    requiresAuth: false,
    purpose: "Read public market trade tape and user activity.",
  },
];

const BLOCKED_PATH_PATTERN =
  /(?:^|\/)(?:order|orders|cancel|cancel-all|cancel-market-orders|deposit|withdraw|bridge|submit|notifications|relayer)(?:\/|$)/i;

function normalizePath(path: string): string {
  const url = path.startsWith("http") ? new URL(path) : null;
  const rawPath = url?.pathname ?? path.split(/[?#]/)[0] ?? "/";
  const withSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export function isPublicPolymarketReadPath(api: PublicPolymarketApi, path: string): boolean {
  const normalized = normalizePath(path);
  if (BLOCKED_PATH_PATTERN.test(normalized)) return false;

  if (api === "gamma") {
    return (
      normalized === "/markets" ||
      /^\/markets\/[^/?#]+$/.test(normalized) ||
      normalized === "/events" ||
      normalized === "/public-search"
    );
  }

  if (api === "clob") {
    return ["/book", "/midpoint", "/spread", "/prices-history"].includes(normalized);
  }

  return normalized === "/trades";
}

function appendParams(
  url: URL,
  params?: URLSearchParams | Record<string, UrlParamValue>,
): void {
  if (!params) return;
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => url.searchParams.set(key, value));
    return;
  }

  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.map(String).join(","));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

export function buildPublicPolymarketUrl(
  api: PublicPolymarketApi,
  path: string,
  params?: URLSearchParams | Record<string, UrlParamValue>,
): string {
  if (!isPublicPolymarketReadPath(api, path)) {
    throw new Error(`${api}:${normalizePath(path)} is not an allowed public read-only endpoint`);
  }
  const url = new URL(normalizePath(path), POLYMARKET_PUBLIC_BASES[api]);
  appendParams(url, params);
  return url.toString();
}

export function parsePublicMidpoint(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const raw = record.mid_price ?? record.mid;
  const midpoint = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(midpoint) ? midpoint : null;
}

export function publicPolymarketStatusDescriptor(): string {
  const gammaCount = POLYMARKET_PUBLIC_ENDPOINTS.filter((endpoint) => endpoint.api === "gamma").length;
  const clobCount = POLYMARKET_PUBLIC_ENDPOINTS.filter((endpoint) => endpoint.api === "clob").length;
  const dataCount = POLYMARKET_PUBLIC_ENDPOINTS.filter((endpoint) => endpoint.api === "data").length;
  return `Public read-only Polymarket APIs: Gamma ${gammaCount}, CLOB ${clobCount}, Data ${dataCount}.`;
}
