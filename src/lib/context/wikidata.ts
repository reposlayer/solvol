import type { SourceDocument } from "../domain/types";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIDATA_RELIABILITY = 0.62;

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function asString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export function normalizeWikidataSearch(payload: unknown, term: string): SourceDocument[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.search) ? root.search : [];
  const retrievedAt = new Date().toISOString();

  return rows
    .map((item): SourceDocument | null => {
      const row = asRecord(item);
      if (!row) return null;
      const id = asString(row.id) ?? asString(row.title);
      const label = asString(row.label);
      if (!id || !label) return null;
      const description = asString(row.description);
      return {
        provider: "wikidata",
        externalId: id,
        title: label,
        url: `https://www.wikidata.org/wiki/${encodeURIComponent(id)}`,
        publishedAt: null,
        retrievedAt,
        summary: description,
        category: "entity_context",
        matchedTerms: [term],
        reliability: WIKIDATA_RELIABILITY,
        metadata: {
          conceptUri: asString(row.concepturi),
          description,
        },
      } satisfies SourceDocument;
    })
    .filter((doc): doc is SourceDocument => doc !== null);
}

export async function fetchWikidataEntities(
  terms: string[],
  opts?: { perTerm?: number },
): Promise<SourceDocument[]> {
  const selected = Array.from(new Set(terms.map((t) => t.trim()).filter((t) => t.length > 2))).slice(0, 8);
  const perTerm = Math.min(Math.max(opts?.perTerm ?? 2, 1), 5);
  const batches = await Promise.all(
    selected.map(async (term) => {
      const params = new URLSearchParams({
        action: "wbsearchentities",
        search: term,
        language: "en",
        format: "json",
        limit: String(perTerm),
      });
      const res = await fetch(`${WIKIDATA_API}?${params.toString()}`, {
        next: { revalidate: 86_400 },
        headers: { "User-Agent": "SolvolCatalystBot/0.1" },
      });
      if (!res.ok) return [] as SourceDocument[];
      return normalizeWikidataSearch(await res.json(), term);
    }),
  );
  return batches.flat();
}
