import {
  detectPriceReactionWindows,
} from "./market-registry.ts";
import {
  createCisaSourceAdapter,
  createCoinGeckoSourceAdapter,
  createEtherscanSourceAdapter,
  createEthereumJsonRpcSourceAdapter,
  createFactCheckSourceAdapter,
  createFemaIpawsSourceAdapter,
  createFedRssSourceAdapter,
  createGdeltSourceAdapter,
  createGNewsSourceAdapter,
  createMastodonSourceAdapter,
  createMediastackSourceAdapter,
  createRedditSourceAdapter,
  createSecRssSourceAdapter,
  createUsgsSourceAdapter,
} from "./source-adapters.ts";
import {
  clusterNewsItems,
  dedupeNewsItems,
  explainWhyMoved,
} from "./source-intelligence.ts";
import type {
  EventItem,
  Market,
  MarketMove,
  NewsItem,
  SourceAdapter,
  WhyMovedCandidate,
} from "./types";
import type { InMemoryRawPayloadStore, RawPayloadReadableStore, StoredRawPayload } from "./raw-store.ts";

export type ReplayRawPayloadStore = RawPayloadReadableStore | Pick<InMemoryRawPayloadStore, "get">;

export type RawPayloadReplayResult = {
  readOnly: true;
  replayedAt: string;
  requestedRawBlobKeys: string[];
  foundRawBlobKeys: string[];
  missingRawBlobKeys: string[];
  newsItems: NewsItem[];
  eventClusters: EventItem[];
  whyMovedCandidates: WhyMovedCandidate[];
};

export type ReplayRawPayloadOptions = {
  rawBlobKeys: string[];
  rawStore: ReplayRawPayloadStore;
  markets?: Market[];
  moves?: MarketMove[];
  now?: string;
};

function sourceAdapterForReplay(sourceId: string, now: string): SourceAdapter<unknown> | null {
  switch (sourceId) {
    case "cisa-rss":
      return createCisaSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "coingecko-context":
      return createCoinGeckoSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "etherscan-indexed":
      return createEtherscanSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "ethereum-json-rpc":
      return createEthereumJsonRpcSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "federal-reserve-rss":
      return createFedRssSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "fema-ipaws-rss":
      return createFemaIpawsSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "fact-check-overlays":
      return createFactCheckSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "gdelt-doc":
      return createGdeltSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "gnews-api":
      return createGNewsSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "mastodon-public":
      return createMastodonSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "mediastack-api":
      return createMediastackSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "reddit-oauth":
      return createRedditSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "sec-rss":
      return createSecRssSourceAdapter([], { now }) as SourceAdapter<unknown>;
    case "usgs-earthquakes":
      return createUsgsSourceAdapter([], { now }) as SourceAdapter<unknown>;
    default:
      return null;
  }
}

async function readStoredPayload(
  rawStore: ReplayRawPayloadStore,
  rawBlobKey: string,
): Promise<StoredRawPayload | null> {
  if ("read" in rawStore) return rawStore.read(rawBlobKey);
  return rawStore.get(rawBlobKey);
}

function uniqueKeys(rawBlobKeys: string[]): string[] {
  return Array.from(new Set(rawBlobKeys.map((key) => key.trim()).filter(Boolean)));
}

export async function replayRawPayloadsFromStore(
  opts: ReplayRawPayloadOptions,
): Promise<RawPayloadReplayResult> {
  const replayedAt = opts.now ?? new Date().toISOString();
  const requestedRawBlobKeys = uniqueKeys(opts.rawBlobKeys);
  const foundRawBlobKeys: string[] = [];
  const missingRawBlobKeys: string[] = [];
  const newsItems: NewsItem[] = [];

  for (const rawBlobKey of requestedRawBlobKeys) {
    const stored = await readStoredPayload(opts.rawStore, rawBlobKey);
    const adapter = stored ? sourceAdapterForReplay(stored.document.sourceId, replayedAt) : null;
    if (!stored || !adapter) {
      missingRawBlobKeys.push(rawBlobKey);
      continue;
    }
    foundRawBlobKeys.push(rawBlobKey);
    newsItems.push(...await adapter.normalize(stored.payload));
  }

  const dedupedNews = dedupeNewsItems(newsItems);
  const eventClusters = clusterNewsItems(dedupedNews, { now: replayedAt });
  const markets = opts.markets ?? [];
  const moves = opts.moves ?? markets.flatMap((market) => detectPriceReactionWindows(market));
  const whyMovedCandidates = markets.flatMap((market) =>
    explainWhyMoved({
      market,
      events: eventClusters,
      moves: moves.filter((move) => move.marketId === market.id),
      createdAt: replayedAt,
    }),
  );

  return {
    readOnly: true,
    replayedAt,
    requestedRawBlobKeys,
    foundRawBlobKeys,
    missingRawBlobKeys,
    newsItems: dedupedNews,
    eventClusters,
    whyMovedCandidates,
  };
}
