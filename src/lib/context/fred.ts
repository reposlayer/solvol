import type { SourceDocument } from "../domain/types";

const FRED_API = "https://api.stlouisfed.org/fred";
const FRED_RELIABILITY = 0.9;

const SERIES_TERMS: Record<string, string[]> = {
  CPIAUCSL: ["cpi", "inflation", "consumer price"],
  FEDFUNDS: ["fed funds", "federal funds", "rate cut", "rate hike", "fomc"],
  UNRATE: ["unemployment", "jobs report", "jobless", "labor market"],
  GDP: ["gdp", "recession", "growth"],
  DGS10: ["10y", "10-year", "treasury yield", "yields"],
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function asString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export function fredSeriesForTerms(terms: string[]): string[] {
  const hay = terms.join(" ").toLowerCase();
  return Object.entries(SERIES_TERMS)
    .filter(([, needles]) => needles.some((needle) => hay.includes(needle)))
    .map(([series]) => series);
}

export function normalizeFredObservations(
  seriesId: string,
  payload: unknown,
  matchedTerms: string[],
): SourceDocument[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.observations) ? root.observations : [];
  const retrievedAt = new Date().toISOString();

  return rows
    .map((item): SourceDocument | null => {
      const row = asRecord(item);
      const date = asString(row?.date);
      const rawValue = asString(row?.value);
      const value = rawValue ? Number(rawValue) : NaN;
      if (!date || !Number.isFinite(value)) return null;
      return {
        provider: "fred",
        externalId: `${seriesId}:${date}`,
        title: `FRED ${seriesId} observation`,
        url: `https://fred.stlouisfed.org/series/${encodeURIComponent(seriesId)}`,
        publishedAt: `${date}T00:00:00.000Z`,
        retrievedAt,
        summary: `${seriesId} printed ${value} on ${date}.`,
        category: "macro",
        matchedTerms,
        reliability: FRED_RELIABILITY,
        metadata: { seriesId, value },
      } satisfies SourceDocument;
    })
    .filter((doc): doc is SourceDocument => doc !== null);
}

export async function fetchFredSources(terms: string[]): Promise<SourceDocument[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  const seriesIds = fredSeriesForTerms(terms).slice(0, 4);
  const batches = await Promise.all(
    seriesIds.map(async (seriesId) => {
      const params = new URLSearchParams({
        series_id: seriesId,
        api_key: key,
        file_type: "json",
        sort_order: "desc",
        limit: "1",
      });
      const res = await fetch(`${FRED_API}/series/observations?${params.toString()}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) return [] as SourceDocument[];
      return normalizeFredObservations(seriesId, await res.json(), terms);
    }),
  );
  return batches.flat();
}
