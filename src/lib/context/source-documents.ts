import type {
  ExternalArticle,
  SourceCategory,
  SourceDocument,
  SourceMatch,
  SourceProvider,
} from "../domain/types";

export function sourceReliability(provider: SourceProvider, label?: string | null): number {
  const l = (label ?? "").toLowerCase();
  if (provider === "rss") {
    if (l.includes("reuters")) return 0.88;
    if (l.includes("ap news")) return 0.86;
    if (l.includes("bbc")) return 0.8;
    if (l.includes("coindesk")) return 0.78;
    if (l.includes("politico")) return 0.74;
    return 0.58;
  }
  if (provider === "gdelt") return 0.76;
  if (provider === "coingecko") return 0.82;
  if (provider === "wikidata") return 0.62;
  if (provider === "fred") return 0.9;
  if (provider === "alpha_vantage") return 0.76;
  return 0.5;
}

function normalizeTerms(terms: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms ?? []) {
    const term = raw.trim();
    if (term.length < 2) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out.slice(0, 24);
}

export function sourceDocumentKey(doc: Pick<SourceDocument, "provider" | "externalId">): string {
  return `${doc.provider}:${doc.externalId}`;
}

export function sourceDocumentFromArticle(article: ExternalArticle): SourceDocument {
  return {
    provider: "rss",
    externalId: article.id || article.link,
    title: article.title,
    url: article.link,
    publishedAt: article.publishedAt,
    retrievedAt: new Date().toISOString(),
    summary: article.summary ?? null,
    category: "news",
    matchedTerms: normalizeTerms(article.matchedTerms),
    reliability: sourceReliability("rss", article.feedLabel),
    metadata: {
      feedLabel: article.feedLabel,
      articleCategory: article.category ?? null,
      relevanceScore: article.relevanceScore ?? null,
      ageMinutes: article.ageMinutes ?? null,
    },
  };
}

export function dedupeSourceDocuments(documents: SourceDocument[]): SourceDocument[] {
  const byKey = new Map<string, SourceDocument>();
  for (const doc of documents) {
    const key = sourceDocumentKey(doc);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...doc, matchedTerms: normalizeTerms(doc.matchedTerms) });
      continue;
    }
    byKey.set(key, {
      ...existing,
      matchedTerms: normalizeTerms([...existing.matchedTerms, ...doc.matchedTerms]),
      reliability: Math.max(existing.reliability, doc.reliability),
      metadata: { ...existing.metadata, ...doc.metadata },
    });
  }
  return Array.from(byKey.values());
}

function termHits(doc: SourceDocument, marketTerms: string[]): string[] {
  const normalized = normalizeTerms(marketTerms);
  const hay = `${doc.title} ${doc.summary ?? ""} ${doc.matchedTerms.join(" ")}`.toLowerCase();
  return normalized.filter((term) => hay.includes(term.toLowerCase()));
}

export function matchDocumentsToMarket(
  marketId: string,
  marketTerms: string[],
  documents: SourceDocument[],
): SourceMatch[] {
  return documents
    .map((doc): SourceMatch | null => {
      const matchedTerms = termHits(doc, marketTerms);
      if (matchedTerms.length === 0) return null;
      const title = doc.title.toLowerCase();
      const titleBoost = matchedTerms.filter((term) => title.includes(term.toLowerCase())).length;
      const relevanceScore = matchedTerms.length + titleBoost;
      return {
        marketId,
        provider: doc.provider,
        documentExternalId: doc.externalId,
        relevanceScore,
        matchedTerms,
        document: doc,
      } satisfies SourceMatch;
    })
    .filter((match): match is SourceMatch => match !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function sourceDensityByMarket(matches: SourceMatch[]): Map<string, number> {
  const providersByMarket = new Map<string, Set<string>>();
  for (const match of matches) {
    const set = providersByMarket.get(match.marketId) ?? new Set<string>();
    set.add(`${match.provider}:${match.documentExternalId}`);
    providersByMarket.set(match.marketId, set);
  }
  return new Map(Array.from(providersByMarket, ([marketId, docs]) => [marketId, docs.size]));
}

export function documentCategoryLabel(category: SourceCategory): string {
  if (category === "event_graph") return "Event graph";
  if (category === "price_feed") return "Price feed";
  if (category === "entity_context") return "Entity context";
  return category.replace(/_/g, " ");
}
