import type { SourceDocument } from "../domain/types";
import { normalizeExternalUrl } from "../safe-url.ts";

const GDELT_DOC = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_RELIABILITY = 0.76;

type GdeltArticle = {
  url?: unknown;
  title?: unknown;
  seendate?: unknown;
  domain?: unknown;
  sourceCountry?: unknown;
  language?: unknown;
  socialimage?: unknown;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function asString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function parseGdeltDate(raw: unknown): string | null {
  const value = asString(raw);
  if (!value) return null;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (compact) {
    const [, year, month, day, hour, minute, second] = compact;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function gdeltDateParam(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
  ].join("");
}

function buildGdeltQuery(terms: string[]): string {
  return terms
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, 8)
    .map((term) => (/\s/.test(term) ? `"${term.replace(/"/g, "")}"` : term))
    .join(" OR ");
}

function gdeltTimeoutMs(): number {
  const value = Number.parseInt(process.env.SOLVOL_GDELT_TIMEOUT_MS ?? "3500", 10);
  return Number.isFinite(value) && value >= 500 ? value : 3500;
}

export function normalizeGdeltArticles(payload: unknown, queryTerms: string[]): SourceDocument[] {
  const root = asRecord(payload);
  const rawArticles = Array.isArray(root?.articles) ? (root.articles as GdeltArticle[]) : [];
  const retrievedAt = new Date().toISOString();

  return rawArticles
    .map((article): SourceDocument | null => {
      const row = asRecord(article);
      if (!row) return null;
      const url = normalizeExternalUrl(asString(row.url));
      const title = asString(row.title);
      if (!url || !title) return null;
      return {
        provider: "gdelt",
        externalId: url,
        title,
        url,
        publishedAt: parseGdeltDate(row.seendate),
        retrievedAt,
        summary: title,
        category: "event_graph",
        matchedTerms: queryTerms,
        reliability: GDELT_RELIABILITY,
        metadata: {
          domain: asString(row.domain),
          sourceCountry: asString(row.sourceCountry),
          language: asString(row.language),
          socialImage: asString(row.socialimage),
        },
      } satisfies SourceDocument;
    })
    .filter((doc): doc is SourceDocument => doc !== null);
}

export async function fetchGdeltArticles(
  queryTerms: string[],
  opts?: {
    limit?: number;
    startIso?: string;
    endIso?: string;
  },
): Promise<SourceDocument[]> {
  const query = buildGdeltQuery(queryTerms);
  if (!query) return [];

  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    sort: "datedesc",
    maxrecords: String(Math.min(Math.max(opts?.limit ?? 30, 1), 100)),
  });
  if (opts?.startIso) params.set("startdatetime", gdeltDateParam(opts.startIso));
  if (opts?.endIso) params.set("enddatetime", gdeltDateParam(opts.endIso));

  let res: Response;
  try {
    res = await fetch(`${GDELT_DOC}?${params.toString()}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(gdeltTimeoutMs()),
      headers: { "User-Agent": "SolvolCatalystBot/0.1" },
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  try {
    return normalizeGdeltArticles(await res.json(), queryTerms);
  } catch {
    return [];
  }
}
