import Parser from "rss-parser";
import type {
  DataSourceStatus,
  FetchBatch,
  FetchCursor,
  GeoRef,
  NewsItem,
  SourceAdapter,
  SourceClass,
} from "./types";
import {
  buildNewsFingerprint,
  deterministicPayloadId,
  extractEntityRefs,
  extractGeoRefs,
  scoreCredibility,
  scoreSentiment,
} from "./source-intelligence.ts";
import {
  buildRawDocumentMetadata,
  buildSourceIdempotencyKey,
  dataSourceStatusFromRegistry,
  DEFAULT_TERMINAL_SOURCE_REGISTRY,
  normalizeSourceUrl,
} from "./source-registry.ts";

type AdapterOpts = {
  now?: string;
};

type RssParserItem = {
  guid?: string;
  id?: string;
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
};

type RssParserLike = {
  parseURL(url: string): Promise<{ items?: RssParserItem[] }>;
};

type LiveRssAdapterOpts = AdapterOpts & {
  feedUrl?: string;
  parser?: RssParserLike;
  limit?: number;
  userAgent?: string;
};

type FetchResponseLike = {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
};

type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;

type LiveGdeltAdapterOpts = AdapterOpts & {
  endpointUrl?: string;
  limit?: number;
  queryTerms?: string[];
  request?: FetchLike;
  timeoutMs?: number;
};

type LiveUsgsAdapterOpts = AdapterOpts & {
  feedUrl?: string;
  limit?: number;
  request?: FetchLike;
  timeoutMs?: number;
};

type LiveCoinGeckoAdapterOpts = AdapterOpts & {
  coinIds?: string[];
  endpointUrl?: string;
  request?: FetchLike;
  timeoutMs?: number;
  vsCurrency?: string;
};

type LiveEthereumJsonRpcAdapterOpts = AdapterOpts & {
  addresses?: string[];
  endpointUrl?: string;
  eventName?: string;
  fromBlock?: number;
  limit?: number;
  maxBlockRange?: number;
  request?: FetchLike;
  timeoutMs?: number;
  topics?: string[];
};

type LiveEtherscanAdapterOpts = AdapterOpts & {
  addresses?: string[];
  apiKey?: string;
  chainId?: string;
  endpointUrl?: string;
  fromBlock?: number;
  limit?: number;
  maxBlockRange?: number;
  request?: FetchLike;
  timeoutMs?: number;
  topics?: string[];
};

type LiveFemaIpawsAdapterOpts = AdapterOpts & {
  endpointUrl?: string;
  limit?: number;
  request?: FetchLike;
  timeoutMs?: number;
};

type LiveRedditAdapterOpts = AdapterOpts & {
  accessToken?: string;
  endpointUrl?: string;
  limit?: number;
  queryTerms?: string[];
  request?: FetchLike;
  timeoutMs?: number;
  userAgent?: string;
};

type LiveMastodonAdapterOpts = AdapterOpts & {
  accessToken?: string;
  instanceUrl?: string;
  limit?: number;
  queryTerms?: string[];
  request?: FetchLike;
  timeoutMs?: number;
};

type LiveGNewsAdapterOpts = AdapterOpts & {
  apiKey?: string;
  endpointUrl?: string;
  language?: string;
  limit?: number;
  queryTerms?: string[];
  request?: FetchLike;
  timeoutMs?: number;
};

type LiveMediastackAdapterOpts = AdapterOpts & {
  apiKey?: string;
  categories?: string;
  countries?: string;
  endpointUrl?: string;
  languages?: string;
  limit?: number;
  queryTerms?: string[];
  request?: FetchLike;
  timeoutMs?: number;
};

export type GdeltRawItem = {
  url?: string;
  title?: string;
  seendate?: string;
  sourceCountry?: string;
  domain?: string;
  language?: string;
  summary?: string;
};

export type SecRssRawItem = {
  accessionNumber?: string;
  formType?: string;
  companyName?: string;
  cik?: string;
  filingDate?: string;
  linkToFilingDetails?: string;
  description?: string;
};

export type FedRssRawItem = {
  id?: string;
  title?: string;
  link?: string;
  published?: string;
  summary?: string;
};

export type UsgsRawItem = {
  id?: string;
  properties?: {
    title?: string;
    time?: number;
    updated?: number;
    mag?: number;
    place?: string;
    url?: string;
  };
  geometry?: {
    coordinates?: number[];
  };
};

export type OfficialFeedRawItem = {
  id?: string;
  title?: string;
  link?: string;
  published?: string;
  summary?: string;
};

export type EthereumJsonRpcLogRawItem = {
  data?: string;
  blockNumber?: number | string;
  transactionHash?: string;
  logIndex?: number;
  address?: string;
  eventName?: string;
  blockTimestamp?: string;
  summary?: string;
  topics?: string[];
};

export type CoinGeckoRawItem = {
  id?: string;
  symbol?: string;
  name?: string;
  marketData?: {
    currentPriceUsd?: number;
    priceChangePercentage24h?: number;
  };
  lastUpdated?: string;
};

export type FemaIpawsRawItem = {
  identifier?: string;
  sender?: string;
  sent?: string;
  event?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  areaDesc?: string;
  web?: string;
};

export type EtherscanLogRawItem = {
  address?: string;
  blockNumber?: number | string;
  timeStamp?: number | string;
  transactionHash?: string;
  logIndex?: number | string;
  topics?: string[];
  data?: string;
};

export type RedditRawItem = {
  id?: string;
  name?: string;
  title?: string;
  selftext?: string;
  subreddit?: string;
  author?: string;
  permalink?: string;
  url?: string;
  createdUtc?: number;
  score?: number;
  numComments?: number;
  removedByCategory?: string;
  bannedBy?: string;
};

export type MastodonRawItem = {
  id?: string;
  url?: string;
  content?: string;
  account?: {
    acct?: string;
    displayName?: string;
  };
  createdAt?: string;
  language?: string;
  favouritesCount?: number;
  reblogsCount?: number;
};

export type GNewsRawItem = {
  title?: string;
  description?: string;
  content?: string;
  url?: string;
  publishedAt?: string;
  source?: {
    name?: string;
    url?: string;
  };
};

export type MediastackRawItem = {
  title?: string;
  description?: string;
  url?: string;
  source?: string;
  author?: string;
  publishedAt?: string;
  category?: string;
  country?: string;
  language?: string;
};

export type FactCheckRawItem = OfficialFeedRawItem;

type CoinGeckoMarketRow = {
  id?: unknown;
  symbol?: unknown;
  name?: unknown;
  current_price?: unknown;
  price_change_percentage_24h?: unknown;
  last_updated?: unknown;
};

type EtherscanLogRow = {
  address?: unknown;
  blockNumber?: unknown;
  data?: unknown;
  logIndex?: unknown;
  timeStamp?: unknown;
  topics?: unknown;
  transactionHash?: unknown;
};

type RedditListingChild = {
  data?: {
    author?: unknown;
    banned_by?: unknown;
    created_utc?: unknown;
    id?: unknown;
    name?: unknown;
    num_comments?: unknown;
    permalink?: unknown;
    removed_by_category?: unknown;
    score?: unknown;
    selftext?: unknown;
    subreddit?: unknown;
    title?: unknown;
    url?: unknown;
  };
};

type MastodonStatusRow = {
  account?: {
    acct?: unknown;
    display_name?: unknown;
  };
  content?: unknown;
  created_at?: unknown;
  favourites_count?: unknown;
  id?: unknown;
  language?: unknown;
  reblogs_count?: unknown;
  url?: unknown;
};

type GNewsArticleRow = {
  content?: unknown;
  description?: unknown;
  publishedAt?: unknown;
  source?: {
    name?: unknown;
    url?: unknown;
  };
  title?: unknown;
  url?: unknown;
};

type MediastackArticleRow = {
  author?: unknown;
  category?: unknown;
  country?: unknown;
  description?: unknown;
  language?: unknown;
  publishedAt?: unknown;
  published_at?: unknown;
  source?: unknown;
  title?: unknown;
  url?: unknown;
};

type EthereumJsonRpcLogRow = {
  address?: unknown;
  blockNumber?: unknown;
  data?: unknown;
  logIndex?: unknown;
  topics?: unknown;
  transactionHash?: unknown;
};

type NewsBuildInput = {
  sourceId: string;
  sourceClass: SourceClass;
  adapterVersion: string;
  externalId: string;
  raw: unknown;
  headline: string;
  observedAt: string;
  publishedAt?: string;
  occurredAt?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  summary?: string;
  body?: string;
  author?: string;
  publisherName?: string;
  publisherDomain?: string;
  language?: string;
  countryCode?: string;
  categories?: string[];
  topics?: string[];
  geo?: GeoRef[];
};

function registry(sourceId: string) {
  const entry = DEFAULT_TERMINAL_SOURCE_REGISTRY.find((item) => item.sourceId === sourceId);
  if (!entry) throw new Error(`missing source registry entry: ${sourceId}`);
  return entry;
}

function now(opts?: AdapterOpts): string {
  return opts?.now ?? new Date().toISOString();
}

function normalizeGdeltDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}.000Z`;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function dateParam(value: string): string {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function buildGdeltQuery(terms: string[]): string {
  const query = terms
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, 8)
    .map((term) => (/\s/.test(term) ? `"${term.replace(/"/g, "")}"` : term))
    .join(" OR ");
  return query ? `(${query})` : "";
}

function normalizeIso(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function hexToNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  const parsed = normalized.startsWith("0x")
    ? Number.parseInt(normalized.slice(2), 16)
    : Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberToHex(value: number): string {
  return `0x${Math.max(0, Math.floor(value)).toString(16)}`;
}

function host(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function buildNewsItem(input: NewsBuildInput): NewsItem {
  const canonicalUrl = normalizeSourceUrl(input.canonicalUrl ?? input.sourceUrl);
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const provenance = buildRawDocumentMetadata({
    sourceId: input.sourceId,
    sourceClass: input.sourceClass,
    externalId: input.externalId,
    fetchedAt: input.observedAt,
    publishedAt: input.publishedAt,
    adapterVersion: input.adapterVersion,
    rawPayload: input.raw,
  });
  const text = `${input.headline} ${input.summary ?? ""} ${input.body ?? ""}`;
  const entities = extractEntityRefs(text);
  const geo = [...(input.geo ?? []), ...extractGeoRefs(text, input.countryCode)];
  const sentiment = scoreSentiment({
    headline: input.headline,
    summary: input.summary,
    body: input.body,
    sourceClass: input.sourceClass,
  });
  const credibility = scoreCredibility({
    sourceClass: input.sourceClass,
    canonicalUrl,
    publisherDomain: input.publisherDomain,
  });

  return {
    id: deterministicPayloadId("news", {
      sourceId: input.sourceId,
      externalId: input.externalId,
      publishedAt: input.publishedAt,
    }),
    sourceId: input.sourceId,
    sourceClass: input.sourceClass,
    externalId: input.externalId,
    headline: input.headline,
    body: input.body,
    summary: input.summary,
    canonicalUrl,
    sourceUrl,
    author: input.author,
    publisherName: input.publisherName,
    publisherDomain: input.publisherDomain,
    language: input.language,
    countryCode: input.countryCode,
    publishedAt: input.publishedAt,
    observedAt: input.observedAt,
    occurredAt: input.occurredAt ?? input.publishedAt,
    categories: input.categories,
    topics: input.topics,
    entities,
    geo,
    sentiment,
    credibility,
    dedupeFingerprint: buildNewsFingerprint({
      headline: input.headline,
      summary: input.summary,
      body: input.body,
      publishedAt: input.publishedAt,
    }),
    provenance: [provenance],
  };
}

function status(sourceId: string, opts: AdapterOpts | undefined, items: number): DataSourceStatus {
  return dataSourceStatusFromRegistry(registry(sourceId), {
    lastAttemptAt: now(opts),
    lastSuccessAt: now(opts),
    consecutiveFailures: 0,
    itemsFetchedLastRun: items,
    itemsAcceptedLastRun: items,
  });
}

function fixtureAdapter<R>(config: {
  sourceId: string;
  sourceClass: SourceClass;
  rawItems: R[];
  opts?: AdapterOpts;
  externalId: (raw: R) => string;
  normalize: (raw: R, observedAt: string, adapterVersion: string) => NewsItem[];
}): SourceAdapter<R> {
  const entry = registry(config.sourceId);
  return {
    sourceId: config.sourceId,
    sourceClass: config.sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<R>> {
      return {
        cursor,
        nextCursor: {
          after: config.rawItems.length ? config.externalId(config.rawItems[config.rawItems.length - 1]!) : cursor?.after,
          sinceIso: now(config.opts),
        },
        rawItems: config.rawItems,
        sourceStatus: status(config.sourceId, config.opts, config.rawItems.length),
      };
    },
    async normalize(raw: R): Promise<NewsItem[]> {
      return config.normalize(raw, now(config.opts), entry.adapterVersion);
    },
    buildExternalId(raw: R): string {
      return config.externalId(raw);
    },
    buildIdempotencyKey(raw: R): string {
      return buildSourceIdempotencyKey({
        sourceId: config.sourceId,
        externalId: config.externalId(raw),
        observedAt: now(config.opts),
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(config.sourceId, config.opts, config.rawItems.length);
    },
  };
}

function createRssParser(opts?: LiveRssAdapterOpts): RssParserLike {
  return opts?.parser ?? new Parser({
    timeout: 8000,
    headers: {
      "User-Agent": opts?.userAgent ?? "SolvolTerminalBot/0.1 (+https://example.local)",
    },
  });
}

function rssDate(raw: RssParserItem, fallback: string): string {
  return normalizeIso(raw.isoDate ?? raw.pubDate, fallback);
}

function fedRssItemToRaw(raw: RssParserItem, observedAt: string): FedRssRawItem {
  return {
    id: raw.guid ?? raw.id ?? raw.link ?? deterministicPayloadId("fed-rss", raw),
    title: raw.title,
    link: raw.link,
    published: rssDate(raw, observedAt),
    summary: raw.contentSnippet ?? raw.summary ?? raw.content,
  };
}

function isAfterCursor(raw: FedRssRawItem, cursor?: FetchCursor): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const publishedMs = Date.parse(raw.published ?? "");
  if (!Number.isFinite(cursorMs) || !Number.isFinite(publishedMs)) return true;
  return publishedMs > cursorMs;
}

function officialFeedItemToRaw(prefix: string, raw: RssParserItem, observedAt: string): OfficialFeedRawItem {
  return {
    id: raw.guid ?? raw.id ?? raw.link ?? deterministicPayloadId(prefix, raw),
    title: raw.title,
    link: raw.link,
    published: rssDate(raw, observedAt),
    summary: raw.contentSnippet ?? raw.summary ?? raw.content,
  };
}

function accessionFromSecItem(raw: RssParserItem): string | undefined {
  const text = [raw.guid, raw.id, raw.link, raw.title, raw.summary, raw.contentSnippet, raw.content]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  return /\d{10}-\d{2}-\d{6}/.exec(text)?.[0];
}

function formTypeFromSecTitle(title: string | undefined): string | undefined {
  return title?.split(/\s+-\s+/)[0]?.trim() || undefined;
}

function companyFromSecTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const companySegment = title.split(/\s+-\s+/).slice(1).join(" - ");
  return companySegment.replace(/\s*\(\d{10}\).*$/, "").trim() || undefined;
}

function cikFromSecTitle(title: string | undefined): string | undefined {
  return title ? /\((\d{10})\)/.exec(title)?.[1] : undefined;
}

function isOfficialFeedAfterCursor(raw: OfficialFeedRawItem, cursor?: FetchCursor): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const publishedMs = Date.parse(raw.published ?? "");
  if (!Number.isFinite(cursorMs) || !Number.isFinite(publishedMs)) return true;
  return publishedMs > cursorMs;
}

function gdeltItemsFromPayload(payload: unknown): GdeltRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const articles = (payload as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) return [];
  return articles.filter((item): item is GdeltRawItem =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
}

function isGdeltAfterCursor(raw: GdeltRawItem, cursor: FetchCursor | undefined, observedAt: string): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const publishedMs = Date.parse(normalizeGdeltDate(raw.seendate, observedAt));
  if (!Number.isFinite(cursorMs) || !Number.isFinite(publishedMs)) return true;
  return publishedMs > cursorMs;
}

export function createGdeltSourceAdapter(rawItems: GdeltRawItem[] = [], opts?: LiveGdeltAdapterOpts): SourceAdapter<GdeltRawItem> {
  const sourceId = "gdelt-doc";
  const sourceClass = "news_api";
  const externalId = (raw: GdeltRawItem) => raw.url ?? deterministicPayloadId("gdelt", raw);
  const normalizeRaw = (raw: GdeltRawItem, observedAt: string, adapterVersion: string) => {
    if (!raw.url || !raw.title) return [];
    const publishedAt = normalizeGdeltDate(raw.seendate, observedAt);
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: raw.url,
        raw,
        headline: raw.title,
        summary: raw.summary,
        observedAt,
        publishedAt,
        sourceUrl: raw.url,
        canonicalUrl: raw.url,
        publisherName: raw.domain,
        publisherDomain: raw.domain,
        language: raw.language,
        countryCode: raw.sourceCountry,
        categories: ["event_graph"],
        topics: ["open_news"],
      }),
    ];
  };

  if (!opts?.queryTerms?.length) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<GdeltRawItem>> {
      const observedAt = now(opts);
      const query = buildGdeltQuery(opts.queryTerms ?? []);
      if (!query) {
        return {
          cursor,
          nextCursor: { after: cursor?.after, sinceIso: observedAt },
          rawItems: [],
          sourceStatus: status(sourceId, opts, 0),
        };
      }

      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
      const params = new URLSearchParams({
        query,
        mode: "artlist",
        format: "json",
        sort: "datedesc",
        maxrecords: String(limit),
      });
      if (cursor?.sinceIso) params.set("startdatetime", dateParam(cursor.sinceIso));
      params.set("enddatetime", dateParam(observedAt));

      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${opts.endpointUrl ?? entry.baseUrl}?${params.toString()}`, {
        headers: {
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`GDELT DOC request failed: ${response.status ?? "unknown"}`);

      const items = gdeltItemsFromPayload(await response.json())
        .filter((item) => isGdeltAfterCursor(item, cursor, observedAt))
        .sort((a, b) =>
          Date.parse(normalizeGdeltDate(a.seendate, observedAt)) -
          Date.parse(normalizeGdeltDate(b.seendate, observedAt)),
        )
        .slice(0, limit);
      const last = items.at(-1);

      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: GdeltRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: GdeltRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.url,
        observedAt: now(opts),
        publishedAt: raw.seendate ? normalizeGdeltDate(raw.seendate, now(opts)) : undefined,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function secRssItemToRaw(raw: RssParserItem, observedAt: string): SecRssRawItem {
  return {
    accessionNumber: accessionFromSecItem(raw),
    formType: formTypeFromSecTitle(raw.title),
    companyName: companyFromSecTitle(raw.title),
    cik: cikFromSecTitle(raw.title),
    filingDate: rssDate(raw, observedAt),
    linkToFilingDetails: raw.link,
    description: raw.contentSnippet ?? raw.summary ?? raw.content,
  };
}

function isSecAfterCursor(raw: SecRssRawItem, cursor?: FetchCursor): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const filedMs = Date.parse(raw.filingDate ?? "");
  if (!Number.isFinite(cursorMs) || !Number.isFinite(filedMs)) return true;
  return filedMs > cursorMs;
}

export function createSecRssSourceAdapter(rawItems: SecRssRawItem[] = [], opts?: LiveRssAdapterOpts): SourceAdapter<SecRssRawItem> {
  const sourceId = "sec-rss";
  const sourceClass = "official";
  const externalId = (raw: SecRssRawItem) => raw.accessionNumber ?? raw.linkToFilingDetails ?? deterministicPayloadId("sec", raw);
  const normalizeRaw = (raw: SecRssRawItem, observedAt: string, adapterVersion: string) => {
      const externalId = raw.accessionNumber ?? raw.linkToFilingDetails ?? deterministicPayloadId("sec", raw);
      const publishedAt = normalizeIso(raw.filingDate, observedAt);
      const form = raw.formType ? `${raw.formType} ` : "";
      const company = raw.companyName ?? "SEC registrant";
      return [
        buildNewsItem({
          sourceId: "sec-rss",
          sourceClass: "official",
          adapterVersion,
          externalId,
          raw,
          headline: `${company} files ${form}with SEC`.replace(/\s+/g, " ").trim(),
          summary: raw.description ?? `${company} official filing ${raw.formType ?? ""}`.trim(),
          observedAt,
          publishedAt,
          sourceUrl: raw.linkToFilingDetails,
          canonicalUrl: raw.linkToFilingDetails,
          publisherName: "SEC EDGAR",
          publisherDomain: "sec.gov",
          countryCode: "US",
          categories: ["official_filing"],
          topics: [raw.formType, raw.companyName, raw.cik].filter((item): item is string => Boolean(item)),
        }),
      ];
    };

  if (!opts?.feedUrl) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<SecRssRawItem>> {
      const observedAt = now(opts);
      const parser = createRssParser(opts);
      const feed = await parser.parseURL(opts.feedUrl!);
      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 80);
      const items = (feed.items ?? [])
        .map((item) => secRssItemToRaw(item, observedAt))
        .filter((item) => isSecAfterCursor(item, cursor))
        .sort((a, b) => Date.parse(a.filingDate ?? observedAt) - Date.parse(b.filingDate ?? observedAt))
        .slice(0, limit);
      const last = items.at(-1);
      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          ...status(sourceId, opts, items.length),
          lastCursor: opts.userAgent,
        }),
      };
    },
    async normalize(raw: SecRssRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: SecRssRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.linkToFilingDetails,
        observedAt: now(opts),
        publishedAt: raw.filingDate,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

export function createFedRssSourceAdapter(rawItems: FedRssRawItem[] = [], opts?: LiveRssAdapterOpts): SourceAdapter<FedRssRawItem> {
  const sourceId = "federal-reserve-rss";
  const sourceClass = "official";
  const externalId = (raw: FedRssRawItem) => raw.id ?? raw.link ?? deterministicPayloadId("fed", raw);
  const normalizeRaw = (raw: FedRssRawItem, observedAt: string, adapterVersion: string) => {
      const externalId = raw.id ?? raw.link ?? deterministicPayloadId("fed", raw);
      const publishedAt = normalizeIso(raw.published, observedAt);
      return [
        buildNewsItem({
          sourceId: "federal-reserve-rss",
          sourceClass: "official",
          adapterVersion,
          externalId,
          raw,
          headline: raw.title ?? "Federal Reserve release",
          summary: raw.summary,
          observedAt,
          publishedAt,
          sourceUrl: raw.link,
          canonicalUrl: raw.link,
          publisherName: "Federal Reserve",
          publisherDomain: host(raw.link) ?? "federalreserve.gov",
          countryCode: "US",
          categories: ["macro_release", "official_statement"],
          topics: ["Federal Reserve", "FOMC", "rates"],
        }),
      ];
    };

  if (!opts?.feedUrl) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<FedRssRawItem>> {
      const observedAt = now(opts);
      const parser = createRssParser(opts);
      const feed = await parser.parseURL(opts.feedUrl!);
      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 80);
      const items = (feed.items ?? [])
        .map((item) => fedRssItemToRaw(item, observedAt))
        .filter((item) => isAfterCursor(item, cursor))
        .sort((a, b) => Date.parse(a.published ?? observedAt) - Date.parse(b.published ?? observedAt))
        .slice(0, limit);
      const last = items.at(-1);
      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: status(sourceId, opts, items.length),
      };
    },
    async normalize(raw: FedRssRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: FedRssRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        observedAt: now(opts),
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function usgsItemsFromPayload(payload: unknown): UsgsRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features.filter((item): item is UsgsRawItem =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
}

function usgsCursorTime(raw: UsgsRawItem): number | undefined {
  return raw.properties?.updated ?? raw.properties?.time;
}

function isUsgsAfterCursor(raw: UsgsRawItem, cursor?: FetchCursor): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const itemMs = usgsCursorTime(raw);
  if (!Number.isFinite(cursorMs) || typeof itemMs !== "number" || !Number.isFinite(itemMs)) return true;
  return itemMs > cursorMs;
}

export function createUsgsSourceAdapter(rawItems: UsgsRawItem[] = [], opts?: LiveUsgsAdapterOpts): SourceAdapter<UsgsRawItem> {
  const sourceId = "usgs-earthquakes";
  const sourceClass = "official";
  const externalId = (raw: UsgsRawItem) => raw.id ?? raw.properties?.url ?? deterministicPayloadId("usgs", raw);
  const normalizeRaw = (raw: UsgsRawItem, observedAt: string, adapterVersion: string) => {
    const externalId = raw.id ?? raw.properties?.url ?? deterministicPayloadId("usgs", raw);
    const publishedAt = raw.properties?.time ? new Date(raw.properties.time).toISOString() : observedAt;
    const coords = raw.geometry?.coordinates;
    const geo: GeoRef[] = coords && coords.length >= 2
      ? [{
          name: raw.properties?.place ?? "USGS event",
          lat: coords[1],
          lon: coords[0],
          confidence: 0.95,
          source: "structured",
        }]
      : [];
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId,
        raw,
        headline: raw.properties?.title ?? "USGS earthquake event",
        summary: raw.properties?.place
          ? `Magnitude ${raw.properties.mag ?? "unknown"} near ${raw.properties.place}.`
          : undefined,
        observedAt,
        publishedAt,
        occurredAt: publishedAt,
        sourceUrl: raw.properties?.url,
        canonicalUrl: raw.properties?.url,
        publisherName: "USGS",
        publisherDomain: "earthquake.usgs.gov",
        categories: ["official_statement"],
        topics: ["earthquake", "hazard"],
        geo,
      }),
    ];
  };

  if (!opts?.feedUrl) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<UsgsRawItem>> {
      const observedAt = now(opts);
      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(opts.feedUrl!, {
        headers: {
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`USGS GeoJSON request failed: ${response.status ?? "unknown"}`);

      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
      const items = usgsItemsFromPayload(await response.json())
        .filter((item) => isUsgsAfterCursor(item, cursor))
        .sort((a, b) => (usgsCursorTime(a) ?? 0) - (usgsCursorTime(b) ?? 0))
        .slice(0, limit);
      const last = items.at(-1);

      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: UsgsRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: UsgsRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.properties?.url,
        observedAt: now(opts),
        publishedAt: raw.properties?.time ? new Date(raw.properties.time).toISOString() : undefined,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

export function createCisaSourceAdapter(rawItems: OfficialFeedRawItem[] = [], opts?: LiveRssAdapterOpts): SourceAdapter<OfficialFeedRawItem> {
  const sourceId = "cisa-rss";
  const sourceClass = "official";
  const externalId = (raw: OfficialFeedRawItem) => raw.id ?? raw.link ?? deterministicPayloadId("cisa", raw);
  const normalizeRaw = (raw: OfficialFeedRawItem, observedAt: string, adapterVersion: string) => {
    const externalId = raw.id ?? raw.link ?? deterministicPayloadId("cisa", raw);
    const publishedAt = normalizeIso(raw.published, observedAt);
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId,
        raw,
        headline: raw.title ?? "CISA advisory",
        summary: raw.summary,
        observedAt,
        publishedAt,
        sourceUrl: raw.link,
        canonicalUrl: raw.link,
        publisherName: "CISA",
        publisherDomain: host(raw.link) ?? "cisa.gov",
        countryCode: "US",
        categories: ["official_statement"],
        topics: ["cybersecurity", "advisory"],
      }),
    ];
  };

  if (!opts?.feedUrl) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<OfficialFeedRawItem>> {
      const observedAt = now(opts);
      const parser = createRssParser(opts);
      const feed = await parser.parseURL(opts.feedUrl!);
      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 80);
      const items = (feed.items ?? [])
        .map((item) => officialFeedItemToRaw("cisa-rss", item, observedAt))
        .filter((item) => isOfficialFeedAfterCursor(item, cursor))
        .sort((a, b) => Date.parse(a.published ?? observedAt) - Date.parse(b.published ?? observedAt))
        .slice(0, limit);
      const last = items.at(-1);
      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: status(sourceId, opts, items.length),
      };
    },
    async normalize(raw: OfficialFeedRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: OfficialFeedRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.link,
        observedAt: now(opts),
        publishedAt: raw.published,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function ethereumLogRowsFromPayload(payload: unknown): EthereumJsonRpcLogRow[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is EthereumJsonRpcLogRow =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
}

function ethereumLogBlockNumber(raw: EthereumJsonRpcLogRawItem): number | undefined {
  return hexToNumber(raw.blockNumber);
}

function ethereumEventNameFromTopics(topics: string[], fallback?: string): string {
  const topic0 = topics[0]?.toLowerCase();
  if (topic0 === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
    return "Transfer";
  }
  if (topic0 === "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925") {
    return "Approval";
  }
  return fallback ?? "Contract log";
}

function ethereumLogRowToRaw(
  row: EthereumJsonRpcLogRow,
  blockTimestamp: string | undefined,
  eventName: string | undefined,
): EthereumJsonRpcLogRawItem {
  const blockNumber = hexToNumber(row.blockNumber);
  const logIndex = hexToNumber(row.logIndex);
  const topics = asStringArray(row.topics);
  const address = asString(row.address)?.toLowerCase();
  const resolvedEventName = ethereumEventNameFromTopics(topics, eventName);
  return {
    ...(asString(row.data) ? { data: asString(row.data) } : {}),
    ...(blockNumber !== undefined ? { blockNumber } : {}),
    ...(asString(row.transactionHash) ? { transactionHash: asString(row.transactionHash) } : {}),
    ...(logIndex !== undefined ? { logIndex } : {}),
    ...(address ? { address } : {}),
    eventName: resolvedEventName,
    ...(blockTimestamp ? { blockTimestamp } : {}),
    summary: `${resolvedEventName} log emitted by ${address ?? "unknown contract"}${blockNumber !== undefined ? ` in block ${blockNumber}` : ""}.`,
    topics,
  };
}

function isEthereumLogAfterCursor(raw: EthereumJsonRpcLogRawItem, cursor?: FetchCursor): boolean {
  if (cursor?.blockNumber === undefined) return true;
  const blockNumber = ethereumLogBlockNumber(raw);
  if (blockNumber === undefined) return true;
  return blockNumber > cursor.blockNumber;
}

function ethereumBlockTimestamp(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const timestamp = hexToNumber((payload as { timestamp?: unknown }).timestamp);
  return timestamp !== undefined ? new Date(timestamp * 1000).toISOString() : undefined;
}

export function createEthereumJsonRpcSourceAdapter(
  rawItems: EthereumJsonRpcLogRawItem[] = [],
  opts?: LiveEthereumJsonRpcAdapterOpts,
): SourceAdapter<EthereumJsonRpcLogRawItem> {
  const sourceId = "ethereum-json-rpc";
  const sourceClass = "onchain";
  const externalId = (raw: EthereumJsonRpcLogRawItem) =>
    raw.transactionHash
      ? `${raw.transactionHash}:${raw.logIndex ?? 0}`
      : deterministicPayloadId("eth-log", raw);
  const normalizeRaw = (raw: EthereumJsonRpcLogRawItem, observedAt: string, adapterVersion: string) => {
      const externalId = raw.transactionHash
        ? `${raw.transactionHash}:${raw.logIndex ?? 0}`
        : deterministicPayloadId("eth-log", raw);
      const publishedAt = normalizeIso(raw.blockTimestamp, observedAt);
      const txUrl = raw.transactionHash ? `https://etherscan.io/tx/${raw.transactionHash}` : undefined;
      const eventName = raw.eventName ?? "Contract log";
      return [
        buildNewsItem({
          sourceId: "ethereum-json-rpc",
          sourceClass: "onchain",
          adapterVersion,
          externalId,
          raw,
          headline: `Ethereum ${eventName} observed`,
          summary: raw.summary ?? `${eventName} from contract ${raw.address ?? "unknown"}.`,
          observedAt,
          publishedAt,
          occurredAt: publishedAt,
          sourceUrl: txUrl,
          canonicalUrl: txUrl,
          publisherName: "Ethereum JSON-RPC",
          publisherDomain: "ethereum.org",
          categories: ["onchain_activity"],
          topics: [eventName, raw.address, ...(raw.topics ?? [])].filter((item): item is string => Boolean(item)),
        }),
      ];
    };

  if (!opts?.endpointUrl) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<EthereumJsonRpcLogRawItem>> {
      const observedAt = now(opts);
      let rpcId = 1;
      let lastHttpStatus: number | undefined;
      const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
        const request = opts.request ?? ((url, init) => fetch(url, init));
        const response = await request(opts.endpointUrl!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
        });
        lastHttpStatus = response.status;
        if (!response.ok) throw new Error(`Ethereum JSON-RPC ${method} request failed: ${response.status ?? "unknown"}`);
        const payload = await response.json();
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error(`Ethereum JSON-RPC ${method} returned invalid payload`);
        }
        const maybeError = (payload as { error?: { message?: unknown } }).error;
        if (maybeError) {
          throw new Error(`Ethereum JSON-RPC ${method} error: ${String(maybeError.message ?? "unknown")}`);
        }
        return (payload as { result?: unknown }).result;
      };

      const latestBlock = hexToNumber(await rpc("eth_blockNumber", []));
      if (latestBlock === undefined) throw new Error("Ethereum JSON-RPC eth_blockNumber returned invalid block number");

      const maxBlockRange = Math.min(Math.max(opts.maxBlockRange ?? 100, 1), 2_000);
      const fromBlock = cursor?.blockNumber !== undefined
        ? cursor.blockNumber + 1
        : opts.fromBlock ?? Math.max(latestBlock - maxBlockRange + 1, 0);
      if (fromBlock > latestBlock) {
        return {
          cursor,
          nextCursor: {
            after: cursor?.after,
            blockNumber: latestBlock,
            sinceIso: observedAt,
          },
          rawItems: [],
          sourceStatus: dataSourceStatusFromRegistry(entry, {
            lastAttemptAt: observedAt,
            lastSuccessAt: observedAt,
            lastHttpStatus,
            consecutiveFailures: 0,
            itemsFetchedLastRun: 0,
            itemsAcceptedLastRun: 0,
          }),
        };
      }

      const toBlock = Math.min(latestBlock, fromBlock + maxBlockRange - 1);
      const filter: Record<string, unknown> = {
        fromBlock: numberToHex(fromBlock),
        toBlock: numberToHex(toBlock),
      };
      const addresses = (opts.addresses ?? []).map((address) => address.trim().toLowerCase()).filter(Boolean);
      const topics = (opts.topics ?? []).map((topic) => topic.trim()).filter(Boolean);
      if (addresses.length > 0) filter.address = addresses;
      if (topics.length > 0) filter.topics = topics;

      const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
      const rows = ethereumLogRowsFromPayload(await rpc("eth_getLogs", [filter]))
        .map((row) => ethereumLogRowToRaw(row, undefined, opts.eventName))
        .filter((item) => isEthereumLogAfterCursor(item, cursor))
        .sort((a, b) =>
          (ethereumLogBlockNumber(a) ?? 0) - (ethereumLogBlockNumber(b) ?? 0) ||
          (a.logIndex ?? 0) - (b.logIndex ?? 0),
        )
        .slice(0, limit);

      const blockNumbers = Array.from(new Set(
        rows.map(ethereumLogBlockNumber).filter((block): block is number => block !== undefined),
      ));
      const timestamps = new Map<number, string>();
      for (const blockNumber of blockNumbers) {
        const block = await rpc("eth_getBlockByNumber", [numberToHex(blockNumber), false]);
        const timestamp = ethereumBlockTimestamp(block);
        if (timestamp) timestamps.set(blockNumber, timestamp);
      }

      const items = rows.map((item) => ({
        ...item,
        blockTimestamp: ethereumLogBlockNumber(item) !== undefined
          ? timestamps.get(ethereumLogBlockNumber(item)!)
          : item.blockTimestamp,
      }));
      const last = items.at(-1);

      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          blockNumber: toBlock,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: EthereumJsonRpcLogRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: EthereumJsonRpcLogRawItem): string {
      const txUrl = raw.transactionHash ? `https://etherscan.io/tx/${raw.transactionHash}` : undefined;
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: txUrl,
        observedAt: now(opts),
        publishedAt: raw.blockTimestamp,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function textWithoutHtml(value: string | undefined): string | undefined {
  return value
    ?.replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function femaItemsFromPayload(payload: unknown): FemaIpawsRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { IpawsArchivedAlerts?: unknown; items?: unknown; alerts?: unknown }).IpawsArchivedAlerts ??
    (payload as { items?: unknown }).items ??
    (payload as { alerts?: unknown }).alerts;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      identifier: asString(item.identifier ?? item.id),
      sender: asString(item.sender),
      sent: asString(item.sent ?? item.published ?? item.updated),
      event: asString(item.event),
      headline: asString(item.headline ?? item.title),
      description: asString(item.description ?? item.summary),
      instruction: asString(item.instruction),
      areaDesc: asString(item.areaDesc ?? item.area_desc),
      web: asString(item.web ?? item.url),
    }));
}

function isFemaAfterCursor(raw: FemaIpawsRawItem, cursor?: FetchCursor): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const sentMs = Date.parse(raw.sent ?? "");
  if (!Number.isFinite(cursorMs) || !Number.isFinite(sentMs)) return true;
  return sentMs > cursorMs;
}

function geoFromFemaArea(areaDesc: string | undefined): GeoRef[] {
  if (!areaDesc) return [];
  const state = /,\s*([A-Z]{2})(?:\b|$)/.exec(areaDesc)?.[1];
  return [{
    name: areaDesc,
    countryCode: "US",
    admin1: state,
    confidence: 0.72,
    source: "structured",
  }];
}

export function createFemaIpawsSourceAdapter(
  rawItems: FemaIpawsRawItem[] = [],
  opts?: LiveFemaIpawsAdapterOpts,
): SourceAdapter<FemaIpawsRawItem> {
  const sourceId = "fema-ipaws-rss";
  const sourceClass = "official";
  const externalId = (raw: FemaIpawsRawItem) => raw.identifier ?? raw.web ?? deterministicPayloadId("fema-ipaws", raw);
  const normalizeRaw = (raw: FemaIpawsRawItem, observedAt: string, adapterVersion: string) => {
    const publishedAt = normalizeIso(raw.sent, observedAt);
    const headline = raw.headline ?? raw.event ?? "FEMA IPAWS alert";
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: externalId(raw),
        raw,
        headline,
        summary: [raw.description, raw.instruction].filter(Boolean).join(" ") || undefined,
        observedAt,
        publishedAt,
        occurredAt: publishedAt,
        sourceUrl: raw.web,
        canonicalUrl: raw.web,
        publisherName: "FEMA IPAWS",
        publisherDomain: raw.web ? host(raw.web) ?? "fema.gov" : "fema.gov",
        countryCode: "US",
        categories: ["official_statement", "public_alert"],
        topics: [raw.event, "IPAWS", "FEMA", "alert"].filter((item): item is string => Boolean(item)),
        geo: geoFromFemaArea(raw.areaDesc),
      }),
    ];
  };

  if (!opts?.endpointUrl) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<FemaIpawsRawItem>> {
      const observedAt = now(opts);
      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
      const params = new URLSearchParams({
        "$top": String(limit),
        "$orderby": "sent desc",
      });
      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${opts.endpointUrl}?${params.toString()}`, {
        headers: {
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`FEMA IPAWS request failed: ${response.status ?? "unknown"}`);
      const items = femaItemsFromPayload(await response.json())
        .filter((item) => item.identifier || item.headline)
        .filter((item) => isFemaAfterCursor(item, cursor))
        .sort((a, b) => Date.parse(normalizeIso(a.sent, observedAt)) - Date.parse(normalizeIso(b.sent, observedAt)))
        .slice(0, limit);
      const last = items.at(-1);
      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: FemaIpawsRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: FemaIpawsRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.web,
        observedAt: now(opts),
        publishedAt: raw.sent,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function etherscanRowsFromPayload(payload: unknown): EtherscanLogRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { result?: unknown }).result;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((item): item is EtherscanLogRow =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      address: asString(item.address)?.toLowerCase(),
      blockNumber: asString(item.blockNumber) ?? asNumber(item.blockNumber),
      timeStamp: asString(item.timeStamp) ?? asNumber(item.timeStamp),
      transactionHash: asString(item.transactionHash),
      logIndex: asString(item.logIndex) ?? asNumber(item.logIndex),
      topics: asStringArray(item.topics),
      data: asString(item.data),
    }));
}

function etherscanBlockNumber(raw: EtherscanLogRawItem): number | undefined {
  return hexToNumber(raw.blockNumber);
}

function etherscanTimestamp(raw: EtherscanLogRawItem, fallback: string): string {
  const stamp = hexToNumber(raw.timeStamp);
  return stamp !== undefined ? new Date(stamp * 1000).toISOString() : fallback;
}

export function createEtherscanSourceAdapter(
  rawItems: EtherscanLogRawItem[] = [],
  opts?: LiveEtherscanAdapterOpts,
): SourceAdapter<EtherscanLogRawItem> {
  const sourceId = "etherscan-indexed";
  const sourceClass = "onchain";
  const externalId = (raw: EtherscanLogRawItem) =>
    raw.transactionHash ? `${raw.transactionHash}:${hexToNumber(raw.logIndex) ?? 0}` : deterministicPayloadId("etherscan-log", raw);
  const normalizeRaw = (raw: EtherscanLogRawItem, observedAt: string, adapterVersion: string) => {
    const eventName = ethereumEventNameFromTopics(raw.topics ?? [], "Indexed log");
    const publishedAt = etherscanTimestamp(raw, observedAt);
    const txUrl = raw.transactionHash ? `https://etherscan.io/tx/${raw.transactionHash}` : undefined;
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: externalId(raw),
        raw,
        headline: `Etherscan ${eventName} observed`,
        summary: `${eventName} log indexed for ${raw.address ?? "unknown contract"}.`,
        observedAt,
        publishedAt,
        occurredAt: publishedAt,
        sourceUrl: txUrl,
        canonicalUrl: txUrl,
        publisherName: "Etherscan",
        publisherDomain: "etherscan.io",
        categories: ["onchain_activity"],
        topics: [eventName, raw.address, ...(raw.topics ?? [])].filter((item): item is string => Boolean(item)),
      }),
    ];
  };

  const apiKey = opts?.apiKey;
  if (!apiKey || (!opts.addresses?.length && !opts.topics?.length)) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<EtherscanLogRawItem>> {
      const observedAt = now(opts);
      const fromBlock = cursor?.blockNumber !== undefined ? cursor.blockNumber + 1 : opts.fromBlock ?? 0;
      const maxBlockRange = Math.min(Math.max(opts.maxBlockRange ?? 100, 1), 2_000);
      const toBlock = fromBlock + maxBlockRange - 1;
      const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1_000);
      const params = new URLSearchParams({
        chainid: opts.chainId ?? "1",
        module: "logs",
        action: "getLogs",
        fromBlock: String(fromBlock),
        toBlock: String(toBlock),
        page: "1",
        offset: String(limit),
        apikey: apiKey,
      });
      const addresses = (opts.addresses ?? []).map((address) => address.trim().toLowerCase()).filter(Boolean);
      if (addresses[0]) params.set("address", addresses[0]);
      const topics = (opts.topics ?? []).map((topic) => topic.trim()).filter(Boolean);
      topics.slice(0, 4).forEach((topic, index) => {
        params.set(`topic${index}`, topic);
        if (index > 0) params.set(`topic${index - 1}_${index}_opr`, "and");
      });

      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${opts.endpointUrl ?? entry.baseUrl}?${params.toString()}`, {
        headers: {
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`Etherscan logs request failed: ${response.status ?? "unknown"}`);
      const payload = await response.json();
      const resultMessage = payload && typeof payload === "object" && !Array.isArray(payload)
        ? asString((payload as { message?: unknown }).message)
        : undefined;
      const items = etherscanRowsFromPayload(payload)
        .filter((item) => item.transactionHash)
        .sort((a, b) =>
          (etherscanBlockNumber(a) ?? 0) - (etherscanBlockNumber(b) ?? 0) ||
          (hexToNumber(a.logIndex) ?? 0) - (hexToNumber(b.logIndex) ?? 0),
        )
        .slice(0, limit);
      const last = items.at(-1);
      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          blockNumber: toBlock,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
          lastCursor: resultMessage,
        }),
      };
    },
    async normalize(raw: EtherscanLogRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: EtherscanLogRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.transactionHash ? `https://etherscan.io/tx/${raw.transactionHash}` : undefined,
        observedAt: now(opts),
        publishedAt: raw.timeStamp !== undefined ? etherscanTimestamp(raw, now(opts)) : undefined,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function redditItemsFromPayload(payload: unknown): RedditRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const children = (payload as { data?: { children?: unknown } }).data?.children;
  if (!Array.isArray(children)) return [];
  return children
    .filter((item): item is RedditListingChild =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => item.data ?? {})
    .map((item) => ({
      id: asString(item.id),
      name: asString(item.name),
      title: asString(item.title),
      selftext: asString(item.selftext),
      subreddit: asString(item.subreddit),
      author: asString(item.author),
      permalink: asString(item.permalink),
      url: asString(item.url),
      createdUtc: asNumber(item.created_utc),
      score: asNumber(item.score),
      numComments: asNumber(item.num_comments),
      removedByCategory: asString(item.removed_by_category),
      bannedBy: asString(item.banned_by),
    }));
}

function redditUrl(raw: RedditRawItem): string | undefined {
  if (raw.permalink?.startsWith("http")) return raw.permalink;
  if (raw.permalink) return `https://www.reddit.com${raw.permalink}`;
  return raw.url;
}

function isRedditTombstone(raw: RedditRawItem): boolean {
  const tombstoneMarkers = new Set(["[deleted]", "[removed]"]);
  return Boolean(
    raw.removedByCategory ||
    raw.bannedBy ||
    tombstoneMarkers.has(raw.title?.trim().toLowerCase() ?? "") ||
    tombstoneMarkers.has(raw.selftext?.trim().toLowerCase() ?? "") ||
    tombstoneMarkers.has(raw.author?.trim().toLowerCase() ?? ""),
  );
}

export function createRedditSourceAdapter(
  rawItems: RedditRawItem[] = [],
  opts?: LiveRedditAdapterOpts,
): SourceAdapter<RedditRawItem> {
  const sourceId = "reddit-oauth";
  const sourceClass = "social";
  const externalId = (raw: RedditRawItem) => raw.name ?? raw.id ?? redditUrl(raw) ?? deterministicPayloadId("reddit", raw);
  const normalizeRaw = (raw: RedditRawItem, observedAt: string, adapterVersion: string) => {
    if (isRedditTombstone(raw)) return [];
    const publishedAt = raw.createdUtc ? new Date(raw.createdUtc * 1000).toISOString() : observedAt;
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: externalId(raw),
        raw,
        headline: raw.title ?? "Reddit discussion",
        summary: raw.selftext,
        observedAt,
        publishedAt,
        sourceUrl: redditUrl(raw),
        canonicalUrl: redditUrl(raw),
        author: raw.author,
        publisherName: raw.subreddit ? `r/${raw.subreddit}` : "Reddit",
        publisherDomain: "reddit.com",
        categories: ["social_discussion"],
        topics: [raw.subreddit, "reddit", "discussion"].filter((item): item is string => Boolean(item)),
      }),
    ];
  };

  if (!opts?.accessToken || !opts.queryTerms?.length) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<RedditRawItem>> {
      const observedAt = now(opts);
      const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
      const params = new URLSearchParams({
        q: opts.queryTerms!.join(" OR "),
        sort: "new",
        t: "day",
        type: "link",
        limit: String(limit),
      });
      if (cursor?.after) params.set("after", cursor.after);
      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${opts.endpointUrl ?? entry.baseUrl}/search?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "User-Agent": opts.userAgent ?? "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`Reddit search request failed: ${response.status ?? "unknown"}`);
      const payload = await response.json();
      const items = redditItemsFromPayload(payload).slice(0, limit);
      const after = payload && typeof payload === "object" && !Array.isArray(payload)
        ? asString((payload as { data?: { after?: unknown } }).data?.after)
        : undefined;
      return {
        cursor,
        nextCursor: {
          after: after ?? items.at(-1)?.name ?? cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: RedditRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: RedditRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: redditUrl(raw),
        observedAt: now(opts),
        publishedAt: raw.createdUtc ? new Date(raw.createdUtc * 1000).toISOString() : undefined,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function mastodonItemsFromPayload(payload: unknown): MastodonRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { statuses?: unknown }).statuses;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((item): item is MastodonStatusRow =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      id: asString(item.id),
      url: asString(item.url),
      content: textWithoutHtml(asString(item.content)),
      account: {
        acct: asString(item.account?.acct),
        displayName: asString(item.account?.display_name),
      },
      createdAt: asString(item.created_at),
      language: asString(item.language),
      favouritesCount: asNumber(item.favourites_count),
      reblogsCount: asNumber(item.reblogs_count),
    }));
}

export function createMastodonSourceAdapter(
  rawItems: MastodonRawItem[] = [],
  opts?: LiveMastodonAdapterOpts,
): SourceAdapter<MastodonRawItem> {
  const sourceId = "mastodon-public";
  const sourceClass = "social";
  const externalId = (raw: MastodonRawItem) => raw.id ?? raw.url ?? deterministicPayloadId("mastodon", raw);
  const normalizeRaw = (raw: MastodonRawItem, observedAt: string, adapterVersion: string) => {
    const content = textWithoutHtml(raw.content);
    const author = raw.account?.acct;
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: externalId(raw),
        raw,
        headline: content?.slice(0, 120) || "Mastodon status",
        summary: content,
        observedAt,
        publishedAt: normalizeIso(raw.createdAt, observedAt),
        sourceUrl: raw.url,
        canonicalUrl: raw.url,
        author,
        publisherName: raw.account?.displayName ?? author ?? "Mastodon",
        publisherDomain: raw.url ? host(raw.url) ?? "mastodon" : "mastodon",
        language: raw.language,
        categories: ["social_discussion"],
        topics: ["mastodon", "discussion", author].filter((item): item is string => Boolean(item)),
      }),
    ];
  };

  const instanceUrl = opts?.instanceUrl;
  if (!instanceUrl || !opts.queryTerms?.length) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<MastodonRawItem>> {
      const observedAt = now(opts);
      const limit = Math.min(Math.max(opts.limit ?? 20, 1), 40);
      const params = new URLSearchParams({
        q: opts.queryTerms!.join(" "),
        type: "statuses",
        limit: String(limit),
        resolve: "false",
      });
      if (cursor?.after) params.set("min_id", cursor.after);
      const instance = instanceUrl.replace(/\/$/, "");
      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${instance}/api/v2/search?${params.toString()}`, {
        headers: {
          ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`Mastodon search request failed: ${response.status ?? "unknown"}`);
      const items = mastodonItemsFromPayload(await response.json()).slice(0, limit);
      const last = items.at(-1);
      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: MastodonRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: MastodonRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.url,
        observedAt: now(opts),
        publishedAt: raw.createdAt,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function newsApiQueryTerms(terms: string[], separator: string): string {
  return Array.from(new Set(
    terms
      .map((term) => term.trim())
      .filter((term) => term.length > 1),
  ))
    .slice(0, 12)
    .join(separator);
}

function isPublishedAfterCursor(publishedAt: string | undefined, cursor?: FetchCursor): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const publishedMs = Date.parse(publishedAt ?? "");
  if (!Number.isFinite(cursorMs) || !Number.isFinite(publishedMs)) return true;
  return publishedMs > cursorMs;
}

function gnewsItemsFromPayload(payload: unknown): GNewsRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { articles?: unknown }).articles;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((item): item is GNewsArticleRow =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => {
      const source = item.source && typeof item.source === "object" && !Array.isArray(item.source)
        ? {
            name: asString(item.source.name),
            url: asString(item.source.url),
          }
        : undefined;
      return {
        title: asString(item.title),
        description: asString(item.description),
        content: asString(item.content),
        url: asString(item.url),
        publishedAt: asString(item.publishedAt),
        ...(source?.name || source?.url ? { source } : {}),
      };
    });
}

export function createGNewsSourceAdapter(
  rawItems: GNewsRawItem[] = [],
  opts?: LiveGNewsAdapterOpts,
): SourceAdapter<GNewsRawItem> {
  const sourceId = "gnews-api";
  const sourceClass = "news_api";
  const externalId = (raw: GNewsRawItem) => raw.url ?? deterministicPayloadId("gnews", raw);
  const normalizeRaw = (raw: GNewsRawItem, observedAt: string, adapterVersion: string) => {
    const publishedAt = normalizeIso(raw.publishedAt, observedAt);
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: externalId(raw),
        raw,
        headline: raw.title ?? "GNews article",
        summary: raw.description,
        body: raw.content,
        observedAt,
        publishedAt,
        sourceUrl: raw.url,
        canonicalUrl: raw.url,
        publisherName: raw.source?.name ?? host(raw.source?.url ?? raw.url),
        publisherDomain: host(raw.source?.url ?? raw.url),
        language: opts?.language ?? "en",
        categories: ["news_recall"],
        topics: ["gnews", "news"].filter(Boolean),
      }),
    ];
  };

  const apiKey = opts?.apiKey;
  if (!apiKey || !opts.queryTerms?.length) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<GNewsRawItem>> {
      const observedAt = now(opts);
      const query = newsApiQueryTerms(opts.queryTerms ?? [], " OR ");
      if (!query) {
        return {
          cursor,
          nextCursor: { after: cursor?.after, sinceIso: observedAt },
          rawItems: [],
          sourceStatus: status(sourceId, opts, 0),
        };
      }

      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
      const params = new URLSearchParams({
        q: query,
        lang: opts.language ?? "en",
        max: String(limit),
        apikey: apiKey,
      });
      if (cursor?.sinceIso) params.set("from", cursor.sinceIso);

      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${opts.endpointUrl ?? `${entry.baseUrl}/search`}?${params.toString()}`, {
        headers: {
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`GNews request failed: ${response.status ?? "unknown"}`);

      const items = gnewsItemsFromPayload(await response.json())
        .filter((item) => item.url || item.title)
        .filter((item) => isPublishedAfterCursor(item.publishedAt, cursor))
        .sort((a, b) =>
          Date.parse(normalizeIso(a.publishedAt, observedAt)) -
          Date.parse(normalizeIso(b.publishedAt, observedAt)),
        )
        .slice(0, limit);
      const last = items.at(-1);

      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: GNewsRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: GNewsRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.url,
        observedAt: now(opts),
        publishedAt: raw.publishedAt,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function mediastackItemsFromPayload(payload: unknown): MediastackRawItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { data?: unknown }).data;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((item): item is MediastackArticleRow =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      title: asString(item.title),
      description: asString(item.description),
      url: asString(item.url),
      source: asString(item.source),
      author: asString(item.author),
      publishedAt: asString(item.publishedAt ?? item.published_at),
      category: asString(item.category),
      country: asString(item.country),
      language: asString(item.language),
    }));
}

export function createMediastackSourceAdapter(
  rawItems: MediastackRawItem[] = [],
  opts?: LiveMediastackAdapterOpts,
): SourceAdapter<MediastackRawItem> {
  const sourceId = "mediastack-api";
  const sourceClass = "news_api";
  const externalId = (raw: MediastackRawItem) => raw.url ?? deterministicPayloadId("mediastack", raw);
  const normalizeRaw = (raw: MediastackRawItem, observedAt: string, adapterVersion: string) => {
    const publishedAt = normalizeIso(raw.publishedAt, observedAt);
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: externalId(raw),
        raw,
        headline: raw.title ?? "mediastack article",
        summary: raw.description,
        observedAt,
        publishedAt,
        sourceUrl: raw.url,
        canonicalUrl: raw.url,
        author: raw.author,
        publisherName: raw.source ?? host(raw.url),
        publisherDomain: host(raw.url),
        language: raw.language,
        countryCode: raw.country?.toUpperCase(),
        categories: raw.category ? [raw.category] : ["news_recall"],
        topics: [raw.category, raw.source, "mediastack", "news"].filter((item): item is string => Boolean(item)),
      }),
    ];
  };

  const apiKey = opts?.apiKey;
  if (!apiKey || !opts.queryTerms?.length) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<MediastackRawItem>> {
      const observedAt = now(opts);
      const query = newsApiQueryTerms(opts.queryTerms ?? [], ",");
      if (!query) {
        return {
          cursor,
          nextCursor: { after: cursor?.after, sinceIso: observedAt },
          rawItems: [],
          sourceStatus: status(sourceId, opts, 0),
        };
      }

      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
      const params = new URLSearchParams({
        access_key: apiKey,
        keywords: query,
        limit: String(limit),
        sort: "published_desc",
      });
      if (opts.languages) params.set("languages", opts.languages);
      if (opts.countries) params.set("countries", opts.countries);
      if (opts.categories) params.set("categories", opts.categories);
      if (cursor?.sinceIso) params.set("date", `${cursor.sinceIso.slice(0, 10)},${observedAt.slice(0, 10)}`);

      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${opts.endpointUrl ?? `${entry.baseUrl}/news`}?${params.toString()}`, {
        headers: {
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`mediastack request failed: ${response.status ?? "unknown"}`);

      const items = mediastackItemsFromPayload(await response.json())
        .filter((item) => item.url || item.title)
        .filter((item) => isPublishedAfterCursor(item.publishedAt, cursor))
        .sort((a, b) =>
          Date.parse(normalizeIso(a.publishedAt, observedAt)) -
          Date.parse(normalizeIso(b.publishedAt, observedAt)),
        )
        .slice(0, limit);
      const last = items.at(-1);

      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: MediastackRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: MediastackRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.url,
        observedAt: now(opts),
        publishedAt: raw.publishedAt,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

export function createFactCheckSourceAdapter(
  rawItems: OfficialFeedRawItem[] = [],
  opts?: LiveRssAdapterOpts,
): SourceAdapter<OfficialFeedRawItem> {
  const sourceId = "fact-check-overlays";
  const sourceClass = "factcheck";
  const externalId = (raw: OfficialFeedRawItem) => raw.id ?? raw.link ?? deterministicPayloadId("fact-check", raw);
  const normalizeRaw = (raw: OfficialFeedRawItem, observedAt: string, adapterVersion: string) => {
    const publishedAt = normalizeIso(raw.published, observedAt);
    return [
      buildNewsItem({
        sourceId,
        sourceClass,
        adapterVersion,
        externalId: externalId(raw),
        raw,
        headline: raw.title ?? "Fact-check item",
        summary: raw.summary,
        observedAt,
        publishedAt,
        sourceUrl: raw.link,
        canonicalUrl: raw.link,
        publisherName: "Fact-check overlay",
        publisherDomain: host(raw.link) ?? "factcheck",
        categories: ["fact_check"],
        topics: ["fact-check", "verification"],
      }),
    ];
  };

  if (!opts?.feedUrl) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<OfficialFeedRawItem>> {
      const observedAt = now(opts);
      const parser = createRssParser(opts);
      const feed = await parser.parseURL(opts.feedUrl!);
      const limit = Math.min(Math.max(opts.limit ?? 30, 1), 80);
      const items = (feed.items ?? [])
        .map((item) => officialFeedItemToRaw("fact-check-overlays", item, observedAt))
        .filter((item) => isOfficialFeedAfterCursor(item, cursor))
        .sort((a, b) => Date.parse(a.published ?? observedAt) - Date.parse(b.published ?? observedAt))
        .slice(0, limit);
      const last = items.at(-1);
      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: status(sourceId, opts, items.length),
      };
    },
    async normalize(raw: OfficialFeedRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: OfficialFeedRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.link,
        observedAt: now(opts),
        publishedAt: raw.published,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}

function coingeckoItemsFromPayload(payload: unknown): CoinGeckoRawItem[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((item): item is CoinGeckoMarketRow =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      id: asString(item.id),
      symbol: asString(item.symbol),
      name: asString(item.name),
      marketData: {
        currentPriceUsd: asNumber(item.current_price),
        priceChangePercentage24h: asNumber(item.price_change_percentage_24h),
      },
      lastUpdated: asString(item.last_updated),
    }));
}

function isCoinGeckoAfterCursor(raw: CoinGeckoRawItem, cursor?: FetchCursor): boolean {
  if (!cursor?.sinceIso) return true;
  const cursorMs = Date.parse(cursor.sinceIso);
  const updatedMs = Date.parse(raw.lastUpdated ?? "");
  if (!Number.isFinite(cursorMs) || !Number.isFinite(updatedMs)) return true;
  return updatedMs > cursorMs;
}

export function createCoinGeckoSourceAdapter(rawItems: CoinGeckoRawItem[] = [], opts?: LiveCoinGeckoAdapterOpts): SourceAdapter<CoinGeckoRawItem> {
  const sourceId = "coingecko-context";
  const sourceClass = "news_api";
  const externalId = (raw: CoinGeckoRawItem) => raw.id ?? raw.symbol ?? deterministicPayloadId("coingecko", raw);
  const normalizeRaw = (raw: CoinGeckoRawItem, observedAt: string, adapterVersion: string) => {
    const externalId = raw.id ?? raw.symbol ?? deterministicPayloadId("coingecko", raw);
    const publishedAt = normalizeIso(raw.lastUpdated, observedAt);
    const price = raw.marketData?.currentPriceUsd;
    const change = raw.marketData?.priceChangePercentage24h;
    return [
      buildNewsItem({
        sourceId: "coingecko-context",
        sourceClass: "news_api",
        adapterVersion,
        externalId,
        raw,
        headline: `${raw.name ?? raw.symbol ?? "Crypto asset"} market context`,
        summary: `${raw.symbol?.toUpperCase() ?? raw.id ?? "asset"} trades at ${price ?? "unknown"} USD with ${change ?? 0}% 24h change.`,
        observedAt,
        publishedAt,
        publisherName: "CoinGecko",
        publisherDomain: "coingecko.com",
        categories: ["price_feed"],
        topics: [raw.name, raw.symbol, "crypto"].filter((item): item is string => Boolean(item)),
      }),
    ];
  };

  if (!opts?.coinIds?.length) {
    return fixtureAdapter({
      sourceId,
      sourceClass,
      rawItems,
      opts,
      externalId,
      normalize: normalizeRaw,
    });
  }

  const entry = registry(sourceId);
  return {
    sourceId,
    sourceClass,
    async fetchBatch(cursor?: FetchCursor): Promise<FetchBatch<CoinGeckoRawItem>> {
      const observedAt = now(opts);
      const coinIds = [...new Set((opts.coinIds ?? [])
        .map((coinId) => coinId.trim().toLowerCase())
        .filter(Boolean))];
      if (coinIds.length === 0) {
        return {
          cursor,
          nextCursor: { after: cursor?.after, sinceIso: observedAt },
          rawItems: [],
          sourceStatus: status(sourceId, opts, 0),
        };
      }

      const params = new URLSearchParams({
        vs_currency: opts.vsCurrency ?? "usd",
        ids: coinIds.join(","),
        order: "market_cap_desc",
        per_page: String(Math.min(coinIds.length, 250)),
        page: "1",
        sparkline: "false",
        price_change_percentage: "1h,24h,7d",
      });
      const request = opts.request ?? ((url, init) => fetch(url, init));
      const response = await request(`${opts.endpointUrl ?? entry.baseUrl}/coins/markets?${params.toString()}`, {
        headers: {
          "User-Agent": "SolvolTerminalBot/0.1 (+https://example.local)",
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!response.ok) throw new Error(`CoinGecko markets request failed: ${response.status ?? "unknown"}`);

      const items = coingeckoItemsFromPayload(await response.json())
        .filter((item) => item.id || item.symbol)
        .filter((item) => isCoinGeckoAfterCursor(item, cursor))
        .sort((a, b) => Date.parse(normalizeIso(a.lastUpdated, observedAt)) - Date.parse(normalizeIso(b.lastUpdated, observedAt)));
      const last = items.at(-1);

      return {
        cursor,
        nextCursor: {
          after: last ? externalId(last) : cursor?.after,
          sinceIso: observedAt,
        },
        rawItems: items,
        sourceStatus: dataSourceStatusFromRegistry(entry, {
          lastAttemptAt: observedAt,
          lastSuccessAt: observedAt,
          lastHttpStatus: response.status,
          consecutiveFailures: 0,
          itemsFetchedLastRun: items.length,
          itemsAcceptedLastRun: items.length,
        }),
      };
    },
    async normalize(raw: CoinGeckoRawItem): Promise<NewsItem[]> {
      return normalizeRaw(raw, now(opts), entry.adapterVersion);
    },
    buildExternalId: externalId,
    buildIdempotencyKey(raw: CoinGeckoRawItem): string {
      return buildSourceIdempotencyKey({
        sourceId,
        externalId: externalId(raw),
        canonicalUrl: raw.id ? `https://www.coingecko.com/en/coins/${encodeURIComponent(raw.id)}` : undefined,
        observedAt: now(opts),
        publishedAt: raw.lastUpdated,
      });
    },
    async healthCheck(): Promise<DataSourceStatus> {
      return status(sourceId, opts, rawItems.length);
    },
  };
}
