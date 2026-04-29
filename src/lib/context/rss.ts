import Parser from "rss-parser";
import type { ExternalArticle } from "@/lib/domain/types";

const DEFAULT_FEEDS: { url: string; label: string }[] = [
  { url: "https://feeds.reuters.com/reuters/topNews", label: "Reuters Top News" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", label: "BBC World" },
  { url: "https://rss.politico.com/politics-news.xml", label: "Politico" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", label: "CNBC" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", label: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", label: "Cointelegraph" },
  { url: "https://decrypt.co/feed", label: "Decrypt" },
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

function categoryForFeed(label: string): string {
  const lower = label.toLowerCase();
  if (/(coin|decrypt|crypto)/.test(lower)) return "crypto";
  if (/(politico|reuters|bbc|cnbc)/.test(lower)) return "macro";
  return "news";
}

function ageMinutes(iso: string): number | undefined {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export async function fetchNewsArticles(
  queryTerms: string[],
  opts?: { limit?: number },
): Promise<ExternalArticle[]> {
  const terms = queryTerms.map((t) => t.toLowerCase()).filter((t) => t.length > 1);
  const results: ExternalArticle[] = [];
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 80);

  const feeds = [...DEFAULT_FEEDS];

  const feedResults = await Promise.all(feeds.map((f) => fetchFeed(f.url, f.label)));
  for (const articles of feedResults) results.push(...articles);

  if (terms.length === 0) {
    return results
      .map((a) => ({
        ...a,
        category: categoryForFeed(a.feedLabel),
        ageMinutes: ageMinutes(a.publishedAt),
      }))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, limit);
  }

  const scored = results
    .map((a) => {
      const hay = `${a.title} ${a.summary ?? ""}`.toLowerCase();
      const matchedTerms = terms.filter((t) => hay.includes(t));
      const titleBoost = terms.reduce((acc, t) => acc + (a.title.toLowerCase().includes(t) ? 2 : 0), 0);
      const score = matchedTerms.length + titleBoost;
      return {
        a: {
          ...a,
          matchedTerms,
          relevanceScore: score,
          category: categoryForFeed(a.feedLabel),
          ageMinutes: ageMinutes(a.publishedAt),
        },
        score,
      };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || Date.parse(y.a.publishedAt) - Date.parse(x.a.publishedAt))
    .map((x) => x.a);

  return scored.length > 0
    ? scored.slice(0, limit)
    : results
        .map((a) => ({
          ...a,
          category: categoryForFeed(a.feedLabel),
          ageMinutes: ageMinutes(a.publishedAt),
        }))
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .slice(0, Math.min(limit, 20));
}
