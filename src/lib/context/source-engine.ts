import type { SourceDocument, SourceMatch } from "@/lib/domain/types";
import { fetchAlphaVantageSources } from "@/lib/context/alpha-vantage";
import { fetchCoinGeckoSourceDocuments } from "@/lib/context/coingecko";
import { fetchFredSources } from "@/lib/context/fred";
import { fetchGdeltArticles } from "@/lib/context/gdelt";
import { fetchNewsArticles } from "@/lib/context/rss";
import {
  dedupeSourceDocuments,
  matchDocumentsToMarket,
  sourceDocumentFromArticle,
} from "@/lib/context/source-documents";
import { fetchWikidataEntities } from "@/lib/context/wikidata";

export type FreshSourceRequest = {
  marketId: string;
  question: string;
  terms: string[];
  windowStartIso?: string;
  windowEndIso?: string;
  limit?: number;
};

export type MarketSourceBundle = {
  terms: string[];
  documents: SourceDocument[];
  matches: SourceMatch[];
};

function markFresh(documents: SourceDocument[]): SourceDocument[] {
  return documents.map((doc) => ({ ...doc, origin: "fresh" }));
}

function cryptoWindow(opts?: { windowStartIso?: string; windowEndIso?: string }): { start: number; end: number } {
  const end = opts?.windowEndIso ? Date.parse(opts.windowEndIso) / 1000 : Date.now() / 1000;
  const start = opts?.windowStartIso ? Date.parse(opts.windowStartIso) / 1000 : end - 24 * 60 * 60;
  return {
    start: Number.isFinite(start) ? start : end - 24 * 60 * 60,
    end: Number.isFinite(end) ? end : Date.now() / 1000,
  };
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export async function collectFreshSourceDocuments(
  request: FreshSourceRequest,
): Promise<SourceDocument[]> {
  const terms = request.terms.slice(0, 24);
  const { start, end } = cryptoWindow(request);
  const [rssArticles, gdelt, wikidata, fred, alpha, coingecko] = await Promise.all([
    safe(fetchNewsArticles(terms, { limit: request.limit ?? 36 }), []),
    safe(
      fetchGdeltArticles(terms, {
        limit: request.limit ?? 30,
        startIso: request.windowStartIso,
        endIso: request.windowEndIso,
      }),
      [],
    ),
    safe(fetchWikidataEntities(terms, { perTerm: 1 }), []),
    safe(fetchFredSources(terms), []),
    safe(fetchAlphaVantageSources(terms), []),
    safe(fetchCoinGeckoSourceDocuments(terms, start, end), []),
  ]);

  return dedupeSourceDocuments(
    markFresh([
      ...rssArticles.map(sourceDocumentFromArticle),
      ...gdelt,
      ...wikidata,
      ...fred,
      ...alpha,
      ...coingecko,
    ]),
  );
}

export async function collectMarketSourceBundle(
  request: FreshSourceRequest,
): Promise<MarketSourceBundle> {
  const documents = await collectFreshSourceDocuments(request);
  const matches = matchDocumentsToMarket(request.marketId, request.terms, documents);
  return {
    terms: request.terms,
    documents,
    matches,
  };
}
