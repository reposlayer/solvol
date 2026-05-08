import type { Market, MarketSource } from "../terminal/types.ts";
import { bridgeSourceFlagName, envNameForBridgeFlag } from "../terminal/bridge-control.ts";

export function buildIngestAuthResult(
  authorization: string | null,
  ...secrets: Array<string | undefined>
): { ok: true } | { ok: false; status: 401; error: string } {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : authorization;
  const allowed = secrets.filter((secret): secret is string => Boolean(secret));
  return token && allowed.includes(token)
    ? { ok: true }
    : { ok: false, status: 401, error: "Unauthorized" };
}

export function normalizeIngestLimit(raw: string | null | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : 24;
  if (!Number.isFinite(parsed)) return 24;
  return Math.min(Math.max(parsed, 1), 80);
}

function truthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function sourceFlagEnabled(env: Record<string, string | undefined>, sourceId: string): boolean {
  return truthy(env[envNameForBridgeFlag(bridgeSourceFlagName(sourceId))]);
}

function lowTrustSocialEnabled(env: Record<string, string | undefined>): boolean {
  return truthy(env[envNameForBridgeFlag("bridge.social.lowTrustSources")]);
}

export type TerminalBridgeFeedConfig = {
  cisaRssUrl?: string;
  coinGeckoEnabled?: boolean;
  coinGeckoIds?: string[];
  etherscanAddresses?: string[];
  etherscanApiKey?: string;
  etherscanFromBlock?: number;
  etherscanMaxBlockRange?: number;
  etherscanTopics?: string[];
  ethereumAddresses?: string[];
  ethereumFromBlock?: number;
  ethereumMaxBlockRange?: number;
  ethereumRpcUrl?: string;
  ethereumTopics?: string[];
  factCheckRssUrl?: string;
  fedRssUrl?: string;
  femaIpawsUrl?: string;
  gdeltEnabled?: boolean;
  gdeltLimit?: number;
  gnewsApiKey?: string;
  gnewsLanguage?: string;
  gnewsTerms?: string[];
  mastodonAccessToken?: string;
  mastodonInstanceUrl?: string;
  mastodonTerms?: string[];
  mediastackApiKey?: string;
  mediastackCategories?: string;
  mediastackCountries?: string;
  mediastackLanguages?: string;
  mediastackTerms?: string[];
  redditAccessToken?: string;
  redditTerms?: string[];
  secRssUrl?: string;
  secUserAgent?: string;
  usgsFeedUrl?: string;
};

export function buildTerminalBridgeFeedConfig(
  env: Record<string, string | undefined> = process.env,
): TerminalBridgeFeedConfig {
  const list = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const fedRssUrl = env.SOLVOL_TERMINAL_FED_RSS_URL?.trim();
  const gdeltEnabled = env.SOLVOL_TERMINAL_GDELT_ENABLED?.trim().toLowerCase() === "true";
  const gdeltLimitRaw = Number.parseInt(env.SOLVOL_TERMINAL_GDELT_LIMIT ?? "30", 10);
  const gdeltLimit = Number.isFinite(gdeltLimitRaw) ? Math.min(Math.max(gdeltLimitRaw, 1), 100) : 30;
  const usgsFeedUrl = env.SOLVOL_TERMINAL_USGS_URL?.trim();
  const cisaRssUrl = env.SOLVOL_TERMINAL_CISA_RSS_URL?.trim();
  const coinGeckoEnabled = env.SOLVOL_TERMINAL_COINGECKO_ENABLED?.trim().toLowerCase() === "true";
  const coinGeckoIds = list(env.SOLVOL_TERMINAL_COINGECKO_IDS).map((coinId) => coinId.toLowerCase());
  const secRssUrl = env.SOLVOL_TERMINAL_SEC_RSS_URL?.trim();
  const secUserAgent = env.SOLVOL_TERMINAL_SEC_USER_AGENT?.trim();
  const ethereumRpcUrl = env.SOLVOL_TERMINAL_ETHEREUM_RPC_URL?.trim();
  const ethereumAddresses = list(env.SOLVOL_TERMINAL_ETHEREUM_CONTRACTS).map((address) => address.toLowerCase());
  const ethereumTopics = list(env.SOLVOL_TERMINAL_ETHEREUM_TOPICS);
  const ethereumFromBlockRaw = Number.parseInt(env.SOLVOL_TERMINAL_ETHEREUM_FROM_BLOCK ?? "", 10);
  const ethereumMaxBlockRangeRaw = Number.parseInt(env.SOLVOL_TERMINAL_ETHEREUM_MAX_BLOCK_RANGE ?? "", 10);
  const ethereumFromBlock = Number.isFinite(ethereumFromBlockRaw) ? Math.max(0, ethereumFromBlockRaw) : undefined;
  const ethereumMaxBlockRange = Number.isFinite(ethereumMaxBlockRangeRaw)
    ? Math.min(Math.max(ethereumMaxBlockRangeRaw, 1), 2_000)
    : undefined;
  const ethereumEnabled = Boolean(ethereumRpcUrl && (ethereumAddresses.length > 0 || ethereumTopics.length > 0));
  const etherscanApiKey = env.SOLVOL_TERMINAL_ETHERSCAN_API_KEY?.trim();
  const etherscanAddresses = list(env.SOLVOL_TERMINAL_ETHERSCAN_CONTRACTS).map((address) => address.toLowerCase());
  const etherscanTopics = list(env.SOLVOL_TERMINAL_ETHERSCAN_TOPICS);
  const etherscanFromBlockRaw = Number.parseInt(env.SOLVOL_TERMINAL_ETHERSCAN_FROM_BLOCK ?? "", 10);
  const etherscanMaxBlockRangeRaw = Number.parseInt(env.SOLVOL_TERMINAL_ETHERSCAN_MAX_BLOCK_RANGE ?? "", 10);
  const etherscanFromBlock = Number.isFinite(etherscanFromBlockRaw) ? Math.max(0, etherscanFromBlockRaw) : undefined;
  const etherscanMaxBlockRange = Number.isFinite(etherscanMaxBlockRangeRaw)
    ? Math.min(Math.max(etherscanMaxBlockRangeRaw, 1), 2_000)
    : undefined;
  const etherscanEnabled = Boolean(etherscanApiKey && (etherscanAddresses.length > 0 || etherscanTopics.length > 0));
  const femaIpawsUrl = env.SOLVOL_TERMINAL_FEMA_IPAWS_URL?.trim();
  const redditAccessToken = env.SOLVOL_TERMINAL_REDDIT_ACCESS_TOKEN?.trim();
  const redditTerms = list(env.SOLVOL_TERMINAL_REDDIT_TERMS);
  const mastodonInstanceUrl = env.SOLVOL_TERMINAL_MASTODON_INSTANCE_URL?.trim().replace(/\/$/, "");
  const mastodonAccessToken = env.SOLVOL_TERMINAL_MASTODON_ACCESS_TOKEN?.trim();
  const mastodonTerms = list(env.SOLVOL_TERMINAL_MASTODON_TERMS);
  const gnewsApiKey = env.SOLVOL_TERMINAL_GNEWS_API_KEY?.trim();
  const gnewsTerms = list(env.SOLVOL_TERMINAL_GNEWS_TERMS);
  const gnewsLanguage = env.SOLVOL_TERMINAL_GNEWS_LANGUAGE?.trim();
  const mediastackApiKey = env.SOLVOL_TERMINAL_MEDIASTACK_API_KEY?.trim();
  const mediastackTerms = list(env.SOLVOL_TERMINAL_MEDIASTACK_TERMS);
  const mediastackLanguages = env.SOLVOL_TERMINAL_MEDIASTACK_LANGUAGES?.trim();
  const mediastackCountries = env.SOLVOL_TERMINAL_MEDIASTACK_COUNTRIES?.trim();
  const mediastackCategories = env.SOLVOL_TERMINAL_MEDIASTACK_CATEGORIES?.trim();
  const factCheckRssUrl = env.SOLVOL_TERMINAL_FACT_CHECK_RSS_URL?.trim();
  const socialEnabled = lowTrustSocialEnabled(env);
  return {
    ...(cisaRssUrl && sourceFlagEnabled(env, "cisa-rss") ? { cisaRssUrl } : {}),
    ...(coinGeckoEnabled && sourceFlagEnabled(env, "coingecko-context") ? { coinGeckoEnabled, coinGeckoIds } : {}),
    ...(etherscanEnabled && sourceFlagEnabled(env, "etherscan-indexed") ? {
      etherscanAddresses,
      etherscanApiKey,
      ...(etherscanFromBlock !== undefined ? { etherscanFromBlock } : {}),
      ...(etherscanMaxBlockRange !== undefined ? { etherscanMaxBlockRange } : {}),
      etherscanTopics,
    } : {}),
    ...(ethereumEnabled && sourceFlagEnabled(env, "ethereum-json-rpc") ? {
      ethereumAddresses,
      ...(ethereumFromBlock !== undefined ? { ethereumFromBlock } : {}),
      ...(ethereumMaxBlockRange !== undefined ? { ethereumMaxBlockRange } : {}),
      ethereumRpcUrl,
      ethereumTopics,
    } : {}),
    ...(factCheckRssUrl && sourceFlagEnabled(env, "fact-check-overlays") ? { factCheckRssUrl } : {}),
    ...(fedRssUrl && sourceFlagEnabled(env, "federal-reserve-rss") ? { fedRssUrl } : {}),
    ...(femaIpawsUrl && sourceFlagEnabled(env, "fema-ipaws-rss") ? { femaIpawsUrl } : {}),
    ...(gdeltEnabled && sourceFlagEnabled(env, "gdelt-doc") ? { gdeltEnabled, gdeltLimit } : {}),
    ...(gnewsApiKey && sourceFlagEnabled(env, "gnews-api") ? {
      gnewsApiKey,
      ...(gnewsLanguage ? { gnewsLanguage } : {}),
      gnewsTerms,
    } : {}),
    ...(mastodonInstanceUrl && mastodonTerms.length > 0 && socialEnabled && sourceFlagEnabled(env, "mastodon-public") ? {
      mastodonInstanceUrl,
      ...(mastodonAccessToken ? { mastodonAccessToken } : {}),
      mastodonTerms,
    } : {}),
    ...(mediastackApiKey && sourceFlagEnabled(env, "mediastack-api") ? {
      mediastackApiKey,
      ...(mediastackCategories ? { mediastackCategories } : {}),
      ...(mediastackCountries ? { mediastackCountries } : {}),
      ...(mediastackLanguages ? { mediastackLanguages } : {}),
      mediastackTerms,
    } : {}),
    ...(redditAccessToken && redditTerms.length > 0 && socialEnabled && sourceFlagEnabled(env, "reddit-oauth") ? { redditAccessToken, redditTerms } : {}),
    ...(secRssUrl && secUserAgent && sourceFlagEnabled(env, "sec-rss") ? { secRssUrl, secUserAgent } : {}),
    ...(usgsFeedUrl && sourceFlagEnabled(env, "usgs-earthquakes") ? { usgsFeedUrl } : {}),
  };
}

export type SourceIngestMarketResult = {
  marketId: string;
  question: string;
  terms: string[];
  queryPack?: {
    queries: string[];
    entities: string[];
    dateConstraints: string[];
    sourcePriorities: string[];
  };
  documents: number;
  matches: number;
};

export type SourceIngestResult = {
  scanned: number;
  documents: number;
  matches: number;
  persisted: boolean;
  markets: SourceIngestMarketResult[];
  terminalBridge: TerminalBridgeIngestResult;
};

export type TerminalBridgeIngestResult = {
  sources: number;
  rawDocuments: number;
  newsItems: number;
  eventClusters: number;
  whyMovedCandidates: number;
  persisted: boolean;
  skippedReason?: string;
  rows: Record<string, number>;
};

export async function buildTerminalMarketsForIngest(
  rows: Array<Pick<SourceIngestMarketResult, "marketId">>,
  marketSource: Pick<MarketSource, "getMarket">,
  limit = 24,
): Promise<Market[]> {
  const marketIds = Array.from(new Set(
    rows
      .map((row) => row.marketId.trim())
      .filter(Boolean),
  )).slice(0, Math.min(Math.max(limit, 1), 80));
  const markets: Market[] = [];

  for (const marketId of marketIds) {
    const market = await marketSource.getMarket(marketId).catch(() => null);
    if (market) markets.push(market);
  }

  return markets;
}

export async function runSourceIngest(opts?: { limit?: number }): Promise<SourceIngestResult> {
  const [
    discovery,
    client,
    marketIntel,
    sourceEngine,
    researchStore,
    terminalRunner,
    sourceAdapters,
    coinGecko,
    queryCompiler,
    terminalPolymarket,
  ] = await Promise.all([
    import("@/lib/polymarket/discovery"),
    import("@/lib/polymarket/client"),
    import("@/lib/polymarket/market-intel"),
    import("@/lib/context/source-engine"),
    import("@/lib/research/supabase"),
    import("@/lib/terminal/ingestion-runner"),
    import("@/lib/terminal/source-adapters"),
    import("@/lib/context/coingecko"),
    import("@/lib/terminal/query-compiler"),
    import("@/lib/terminal/polymarket-source"),
  ]);

  const limit = Math.min(Math.max(opts?.limit ?? 24, 1), 80);
  const lanes = await Promise.all([
    discovery.fetchDiscoveryLane("hot", { limit: Math.min(limit, 40) }).catch(() => []),
    discovery.fetchDiscoveryLane("high_volume", { limit: Math.min(limit, 40) }).catch(() => []),
    discovery.fetchDiscoveryLane("catalyst_rich", { limit: Math.min(limit, 40) }).catch(() => []),
  ]);

  const byId = new Map<string, { id: string; question: string }>();
  for (const row of lanes.flat()) {
    if (!byId.has(row.id)) byId.set(row.id, { id: row.id, question: row.question });
    if (byId.size >= limit) break;
  }

  const marketResults: SourceIngestMarketResult[] = [];
  let documents = 0;
  let matches = 0;

  for (const row of byId.values()) {
    const market = await client.fetchGammaMarket(row.id).catch(() => ({
      id: row.id,
      question: row.question,
      description: null,
    }));
    const queryPack = queryCompiler.compileMarketQueryPack({
      marketId: market.id,
      question: market.question,
      description: market.description,
      category: "category" in market && typeof market.category === "string" ? market.category : undefined,
    });
    const terms = Array.from(new Set([
      ...queryPack.gdeltTerms,
      ...marketIntel.deriveNewsTerms(market.question, market.description),
    ].map((term) => term.trim()).filter((term) => term.length > 1))).slice(0, 24);
    const bundle = await sourceEngine.collectMarketSourceBundle({
      marketId: market.id,
      question: market.question,
      terms,
      limit: 28,
    });
    const storedDocs = await researchStore.persistSourceDocuments(bundle.documents);
    await researchStore.persistMarketSourceMatches(bundle.matches);

    documents += storedDocs.length || bundle.documents.length;
    matches += bundle.matches.length;
    marketResults.push({
      marketId: market.id,
      question: market.question,
      terms,
      queryPack: {
        queries: queryPack.queries,
        entities: queryPack.entities.map((entity) => entity.name),
        dateConstraints: queryPack.dateConstraints.map((date) => date.text),
        sourcePriorities: queryPack.sourcePriorities.map((source) => source.label),
      },
      documents: bundle.documents.length,
      matches: bundle.matches.length,
    });
  }

  const terminalMarketSource = terminalPolymarket.createPolymarketMarketSource();
  const terminalMarkets = await buildTerminalMarketsForIngest(
    marketResults,
    terminalMarketSource,
    limit,
  );

  const terminalFeedConfig = buildTerminalBridgeFeedConfig();
  const terminalAdapters: Array<ReturnType<typeof terminalRunner.runnableSourceAdapter>> = [];
  const marketTerms = Array.from(new Set(
    marketResults
      .flatMap((market) => market.terms)
      .map((term) => term.trim())
      .filter((term) => term.length > 1),
  )).slice(0, 24);
  if (terminalFeedConfig.fedRssUrl) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createFedRssSourceAdapter([], {
        feedUrl: terminalFeedConfig.fedRssUrl,
      })),
    );
  }
  if (terminalFeedConfig.secRssUrl && terminalFeedConfig.secUserAgent) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createSecRssSourceAdapter([], {
        feedUrl: terminalFeedConfig.secRssUrl,
        userAgent: terminalFeedConfig.secUserAgent,
      })),
    );
  }
  if (terminalFeedConfig.gdeltEnabled) {
    if (marketTerms.length > 0) {
      terminalAdapters.push(
        terminalRunner.runnableSourceAdapter(sourceAdapters.createGdeltSourceAdapter([], {
          queryTerms: marketTerms,
          limit: terminalFeedConfig.gdeltLimit,
        })),
      );
    }
  }
  if (terminalFeedConfig.gnewsApiKey) {
    const queryTerms = Array.from(new Set([
      ...(terminalFeedConfig.gnewsTerms ?? []),
      ...marketTerms,
    ])).slice(0, 24);
    if (queryTerms.length > 0) {
      terminalAdapters.push(
        terminalRunner.runnableSourceAdapter(sourceAdapters.createGNewsSourceAdapter([], {
          apiKey: terminalFeedConfig.gnewsApiKey,
          language: terminalFeedConfig.gnewsLanguage,
          queryTerms,
        })),
      );
    }
  }
  if (terminalFeedConfig.mediastackApiKey) {
    const queryTerms = Array.from(new Set([
      ...(terminalFeedConfig.mediastackTerms ?? []),
      ...marketTerms,
    ])).slice(0, 24);
    if (queryTerms.length > 0) {
      terminalAdapters.push(
        terminalRunner.runnableSourceAdapter(sourceAdapters.createMediastackSourceAdapter([], {
          apiKey: terminalFeedConfig.mediastackApiKey,
          categories: terminalFeedConfig.mediastackCategories,
          countries: terminalFeedConfig.mediastackCountries,
          languages: terminalFeedConfig.mediastackLanguages,
          queryTerms,
        })),
      );
    }
  }
  if (terminalFeedConfig.factCheckRssUrl) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createFactCheckSourceAdapter([], {
        feedUrl: terminalFeedConfig.factCheckRssUrl,
      })),
    );
  }
  if (terminalFeedConfig.usgsFeedUrl) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createUsgsSourceAdapter([], {
        feedUrl: terminalFeedConfig.usgsFeedUrl,
      })),
    );
  }
  if (terminalFeedConfig.cisaRssUrl) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createCisaSourceAdapter([], {
        feedUrl: terminalFeedConfig.cisaRssUrl,
      })),
    );
  }
  if (terminalFeedConfig.ethereumRpcUrl) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createEthereumJsonRpcSourceAdapter([], {
        addresses: terminalFeedConfig.ethereumAddresses,
        endpointUrl: terminalFeedConfig.ethereumRpcUrl,
        fromBlock: terminalFeedConfig.ethereumFromBlock,
        maxBlockRange: terminalFeedConfig.ethereumMaxBlockRange,
        topics: terminalFeedConfig.ethereumTopics,
      })),
    );
  }
  if (terminalFeedConfig.etherscanApiKey) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createEtherscanSourceAdapter([], {
        addresses: terminalFeedConfig.etherscanAddresses,
        apiKey: terminalFeedConfig.etherscanApiKey,
        fromBlock: terminalFeedConfig.etherscanFromBlock,
        maxBlockRange: terminalFeedConfig.etherscanMaxBlockRange,
        topics: terminalFeedConfig.etherscanTopics,
      })),
    );
  }
  if (terminalFeedConfig.femaIpawsUrl) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createFemaIpawsSourceAdapter([], {
        endpointUrl: terminalFeedConfig.femaIpawsUrl,
      })),
    );
  }
  if (terminalFeedConfig.redditAccessToken) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createRedditSourceAdapter([], {
        accessToken: terminalFeedConfig.redditAccessToken,
        queryTerms: terminalFeedConfig.redditTerms,
      })),
    );
  }
  if (terminalFeedConfig.mastodonInstanceUrl) {
    terminalAdapters.push(
      terminalRunner.runnableSourceAdapter(sourceAdapters.createMastodonSourceAdapter([], {
        accessToken: terminalFeedConfig.mastodonAccessToken,
        instanceUrl: terminalFeedConfig.mastodonInstanceUrl,
        queryTerms: terminalFeedConfig.mastodonTerms,
      })),
    );
  }
  if (terminalFeedConfig.coinGeckoEnabled) {
    const derivedCoinIds = coinGecko.cryptoTickersForTerms(marketTerms)
      .map((ticker) => coinGecko.COINGECKO_SYMBOL_MAP[ticker])
      .filter((coinId): coinId is string => Boolean(coinId));
    const coinIds = Array.from(new Set([
      ...(terminalFeedConfig.coinGeckoIds ?? []),
      ...derivedCoinIds,
    ])).slice(0, 50);
    if (coinIds.length > 0) {
      terminalAdapters.push(
        terminalRunner.runnableSourceAdapter(sourceAdapters.createCoinGeckoSourceAdapter([], {
          coinIds,
        })),
      );
    }
  }

  const terminalBridgeRun = await terminalRunner.runTerminalIngestionBridge({
    adapters: terminalAdapters,
    markets: terminalMarkets,
    now: new Date().toISOString(),
  });
  const terminalBridge: TerminalBridgeIngestResult = {
    sources: terminalBridgeRun.sources.length,
    rawDocuments: terminalBridgeRun.artifacts.rawDocuments?.length ?? 0,
    newsItems: terminalBridgeRun.artifacts.newsItems.length,
    eventClusters: terminalBridgeRun.artifacts.eventClusters.length,
    whyMovedCandidates: terminalBridgeRun.artifacts.whyMovedCandidates.length,
    persisted: terminalBridgeRun.persistence.persisted,
    skippedReason: terminalBridgeRun.persistence.skippedReason,
    rows: terminalBridgeRun.persistence.rows,
  };

  return {
    scanned: marketResults.length,
    documents,
    matches,
    persisted: researchStore.supabaseConfigured(),
    markets: marketResults,
    terminalBridge,
  };
}
