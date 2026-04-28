import Parser from "rss-parser";
import type { ExternalArticle } from "@/lib/domain/types";

const DEFAULT_FEEDS: { url: string; label: string }[] = [
  { url: "https://feeds.reuters.com/reuters/topNews", label: "Reuters Top News" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", label: "CoinDesk" },
];

const parser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent": "SolvolCatalystBot/0.1 (+https://example.local)",
  },
});

async function fetchFeed(url: string, label: string): Promise<ExternalArticle[]> {
  try {
    const feed = await parser.parseURL(url);
    const items = feed.items ?? [];
    return items.map((item, i) => {
      const title = item.title ?? "(untitled)";
      const link = item.link ?? url;
      const pub =
        item.isoDate ??
        item.pubDate ??
        new Date().toISOString();
      return {
        id: `${label}:${link}:${i}`,
        title,
        link,
        publishedAt: new Date(pub).toISOString(),
        summary: item.contentSnippet ?? item.content ?? undefined,
        feedLabel: label,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchNewsArticles(queryTerms: string[]): Promise<ExternalArticle[]> {
  const terms = queryTerms.map((t) => t.toLowerCase()).filter((t) => t.length > 1);
  const results: ExternalArticle[] = [];

  const feeds = [...DEFAULT_FEEDS];

  for (const f of feeds) {
    const articles = await fetchFeed(f.url, f.label);
    results.push(...articles);
  }

  if (terms.length === 0) {
    return results.slice(0, 40);
  }

  const scored = results
    .map((a) => {
      const hay = `${a.title} ${a.summary ?? ""}`.toLowerCase();
      const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);

  return scored.length > 0 ? scored.slice(0, 25) : results.slice(0, 15);
}
