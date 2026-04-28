export type CatalystSource =
  | "news"
  | "poll"
  | "price_feed"
  | "sportsbook"
  | "social"
  | "onchain";

export type CatalystDirection = "YES" | "NO" | "unclear";

export type ConfidenceBand = "high" | "medium" | "low";

/** Per-component scores in 0–1 for transparency (engine output, not raw LLM). */
export type CatalystScoringBreakdown = {
  temporalProximity: number;
  sourceReliability: number;
  volumeSupport?: number;
  crossMarketSupport?: number;
  liquidityPenalty?: number;
};

export type Catalyst = {
  marketId: string;
  title: string;
  source: CatalystSource;
  timestamp: string;
  summary: string;
  affectedEntities: string[];
  confidence: number;
  direction: CatalystDirection;
  evidence: string[];
  sourceUrl?: string | null;
  retrievedAt: string;
  rawSnippetId?: string | null;
  scoringBreakdown: CatalystScoringBreakdown;
};

export type RelatedMarketSnapshot = {
  marketId: string;
  title: string;
  yesPrice: number;
  movePercent: number;
  directionAligned: boolean;
  correlationScore: number;
};

export type MarketMoveWindow = {
  windowStart: string;
  windowEnd: string;
  priceBefore: number;
  priceAfter: number;
  movePercent: number;
  /** YES outcome probability implied price 0–1 */
  baselineVolume24h: number;
  volumeInWindowEstimate: number;
  volumeMultiplierVs7dAvg: number;
  spreadBefore?: number;
  spreadAfter?: number;
  liquidityUsd?: number;
};

export type MarketMoveExplanation = {
  marketId: string;
  marketTitle: string;
  priceBefore: number;
  priceAfter: number;
  movePercent: number;
  volumeChange: number;
  move: MarketMoveWindow;
  likelyCatalysts: Catalyst[];
  confidence: number;
  confidenceBand: ConfidenceBand;
  explanation: string;
  possibleCausesWhenWeak: string[];
  relatedMarkets: RelatedMarketSnapshot[];
  crossMarketSummary?: string | null;
  sourcesByCategory: Record<string, { label: string; url?: string }[]>;
};

export type ExtractedEntities = {
  people: string[];
  organizations: string[];
  tickers: string[];
  dates: string[];
  topics: string[];
  relatedTerms: string[];
  categoryGuess: string;
};

export type ExternalArticle = {
  id: string;
  title: string;
  link: string;
  publishedAt: string;
  summary?: string;
  feedLabel: string;
};

export type CryptoWindowStats = {
  assetId: string;
  symbol: string;
  priceStartUsd: number;
  priceEndUsd: number;
  changePercent: number;
};
