export type DataSourceKind = "polymarket" | "mock" | "external" | "system";

export type SourceClass =
  | "market"
  | "official"
  | "news_api"
  | "rss"
  | "social"
  | "onchain"
  | "factcheck";

export type HealthState = "healthy" | "degraded" | "failing" | "paused";
export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed";
export type ConfidenceLabel = "low" | "medium" | "high";

export type ProvenanceRef = {
  sourceId: string;
  sourceClass: SourceClass;
  externalId: string;
  sourceUrl?: string;
  fetchedAt: string;
  publishedAt?: string;
  rawBlobKey: string;
  checksumSha256: string;
  adapterVersion: string;
};

export type EntityRef = {
  kind: "person" | "org" | "ticker" | "token" | "place" | "market_term" | "form";
  canonicalName: string;
  aliases: string[];
  confidence: number;
  sourceText?: string;
  externalIds?: Record<string, string>;
};

export type GeoRef = {
  name: string;
  countryCode?: string;
  admin1?: string;
  lat?: number;
  lon?: number;
  confidence: number;
  source: "explicit" | "structured" | "source-country" | "inferred";
};

export type RuleScore = {
  label: ConfidenceLabel;
  score: number;
  ruleIds: string[];
};

export type SentimentScore = {
  label: SentimentLabel;
  score: number;
  ruleIds: string[];
};

export type NewsItem = {
  id: string;
  sourceId: string;
  sourceClass: SourceClass;
  externalId: string;
  headline: string;
  body?: string;
  summary?: string;
  canonicalUrl?: string;
  sourceUrl?: string;
  author?: string;
  publisherName?: string;
  publisherDomain?: string;
  language?: string;
  countryCode?: string;
  publishedAt?: string;
  observedAt: string;
  occurredAt?: string;
  categories?: string[];
  topics?: string[];
  entities: EntityRef[];
  geo?: GeoRef[];
  sentiment: SentimentScore;
  credibility: RuleScore & { reasons: string[] };
  dedupeFingerprint: string;
  provenance: ProvenanceRef[];
};

export type DataSourceStatus = {
  sourceId: string;
  sourceClass: SourceClass;
  health: HealthState;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lagSeconds?: number;
  lastCursor?: string;
  lastHttpStatus?: number;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  consecutiveFailures: number;
  itemsFetchedLastRun?: number;
  itemsAcceptedLastRun?: number;
  backlogApprox?: number;
  lastError?: string;
};

export type FetchCursor = {
  after?: string;
  page?: number;
  sinceIso?: string;
  blockNumber?: number;
  etag?: string;
  lastModified?: string;
};

export type FetchBatch<R> = {
  cursor?: FetchCursor;
  nextCursor?: FetchCursor;
  rawItems: R[];
  sourceStatus: Partial<DataSourceStatus>;
};

export type SourceAdapter<R> = {
  readonly sourceId: string;
  readonly sourceClass: SourceClass;
  fetchBatch: (cursor?: FetchCursor) => Promise<FetchBatch<R>>;
  normalize: (raw: R) => Promise<NewsItem[]>;
  buildExternalId: (raw: R) => string;
  buildIdempotencyKey: (raw: R) => string;
  healthCheck: () => Promise<DataSourceStatus>;
};

export type SourceRegistryEntry = {
  sourceId: string;
  sourceClass: SourceClass;
  label: string;
  enabled: boolean;
  readOnly: true;
  priority: number;
  pollIntervalSec: number;
  adapterVersion: string;
  baseUrl?: string;
  rateLimitPerMinute?: number;
};

export type RawDocument = {
  id: string;
  sourceId: string;
  sourceClass: SourceClass;
  externalId: string;
  rawBlobKey: string;
  checksumSha256: string;
  fetchedAt: string;
  publishedAt?: string;
  adapterVersion: string;
  byteLength: number;
};

export type SourceCursorRecord = {
  sourceId: string;
  cursor: FetchCursor;
  updatedAt: string;
};

export type WhyMovedDirection = "yes" | "no" | "unclear";
export type MarketFamily =
  | "approval"
  | "price_threshold"
  | "election"
  | "filing"
  | "enforcement"
  | "onchain"
  | "weather"
  | "sports"
  | "generic";

export type MarketFamilyClassification = {
  family: MarketFamily;
  label: string;
  confidence: number;
  ruleId: `market_family:${MarketFamily}`;
  matchedTerms: string[];
};

export type WhyMovedEvidenceStatus = "supported" | "insufficient_evidence" | "contradicted" | "divergent_market";
export type WhyMovedMoveQualityLabel = "weak" | "medium" | "strong";

export type WhyMovedScoreBreakdown = {
  lexical: number;
  entity: number;
  time: number;
  source: number;
  corroboration: number;
  marketReaction: number;
  penalties: number;
};

export type WhyMovedMoveQuality = {
  label: WhyMovedMoveQualityLabel;
  score: number;
  components: {
    magnitude: number;
    volume: number;
    timing: number;
    directionClarity: number;
  };
  ruleIds: string[];
};

export type WhyMovedMarketDivergence = {
  detected: boolean;
  expectedDirection: WhyMovedDirection;
  observedDirection: WhyMovedDirection;
  reason?: string;
  ruleIds: string[];
};

export type EventMarketLinkStatus = "linked" | "weak" | "unrelated";

export type EventMarketLink = {
  eventId: string;
  marketId: string;
  status: EventMarketLinkStatus;
  score: number;
  components: {
    explicitMarket: number;
    lexical: number;
    entity: number;
    topic: number;
    penalties: number;
  };
  reasons: string[];
  ruleIds: string[];
};

export type WhyMovedCandidate = {
  id: string;
  marketId: string;
  marketSlug: string;
  eventId: string;
  moveId: string;
  eventMarketLink: EventMarketLink;
  direction: WhyMovedDirection;
  evidenceStatus: WhyMovedEvidenceStatus;
  confidence: number;
  scoreBreakdown: WhyMovedScoreBreakdown;
  moveQuality: WhyMovedMoveQuality;
  marketDivergence: WhyMovedMarketDivergence;
  observedPriceMove?: {
    from: number;
    to: number;
    absChange: number;
    windowStart: string;
    windowEnd: string;
  };
  reasons: string[];
  ruleIds: string[];
  supportingNewsItemIds: string[];
  conflictingNewsItemIds?: string[];
  createdAt: string;
};

export type TerminalDataSourceRef = {
  id: string;
  label: string;
  kind: DataSourceKind;
  url?: string | null;
};

export type MarketSourceMode = "real" | "mock" | "hybrid";

export type MarketSourceStatus = {
  id: string;
  label: string;
  mode: MarketSourceMode;
  readOnly: boolean;
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: string;
  message: string;
};

export type MarketSourceMarketQuery = {
  limit?: number;
  search?: string;
  category?: string;
  moversOnly?: boolean;
};

export type MarketSourceActivityQuery = {
  marketId?: string | null;
  walletAddress?: string | null;
  limit?: number;
};

export type MarketSourceEventQuery = {
  marketId?: string | null;
  limit?: number;
};

export type MarketStatus = "open" | "closed" | "resolved" | "paused";

export type MarketOutcome = {
  id: string;
  label: string;
  probability: number;
  price: number;
};

export type MarketPricePoint = {
  timestamp: string;
  probability: number;
  volumeUsd?: number;
};

export type Market = {
  id: string;
  source: TerminalDataSourceRef;
  title: string;
  category: string;
  event: string;
  url: string | null;
  description: string;
  resolutionRules: string;
  outcomes: MarketOutcome[];
  probability: number;
  volume24h: number;
  volume7d: number;
  liquidity: number;
  openInterest: number | null;
  closeTime: string | null;
  createdAt: string | null;
  updatedAt: string;
  status: MarketStatus;
  priceHistory: MarketPricePoint[];
};

export type MarketMove = {
  id: string;
  marketId: string;
  timestamp: string;
  windowMinutes: number;
  probabilityBefore: number;
  probabilityAfter: number;
  volumeUsd: number;
  source: string;
};

export type WalletActivity = {
  id: string;
  marketId: string;
  walletAddress: string;
  label: string | null;
  outcome: string;
  side: "BUY" | "SELL";
  size: number;
  notionalUsd: number;
  price: number;
  timestamp: string;
  source: string;
};

export type EventItemKind =
  | "news"
  | "market_move"
  | "wallet"
  | "volatility"
  | "resolution"
  | "system"
  | "breaking_news"
  | "official_filing"
  | "official_statement"
  | "macro_release"
  | "onchain_activity"
  | "social_rumor"
  | "factcheck";

export type EventImpact = "up" | "down" | "neutral";
export type EventClusterLifecycleStatus = "new" | "developing" | "corroborated" | "contested" | "refuted";
export type EventRumorStatus = "not_rumor" | "unverified" | "corroborated" | "contested" | "refuted";

export type TerminalStateTransition<TState extends string> = {
  accepted: boolean;
  from: TState;
  to: TState;
  at: string;
  reason: string;
  ruleId: string;
};

export type MarketStatusTransition = TerminalStateTransition<MarketStatus>;
export type EventLifecycleTransition = TerminalStateTransition<EventClusterLifecycleStatus>;

export type EventContradiction = {
  id: string;
  kind: "factcheck_refutes" | "opposing_claim";
  contradictingNewsItemId: string;
  contradictedNewsItemIds: string[];
  confidence: number;
  reason: string;
  ruleId: string;
};

export type EventTextSignature = {
  algorithm: "simhash64/minhash-v1";
  simhash64: string;
  minhash: string[];
  shingleCount: number;
  memberSignatures: Array<{
    newsItemId: string;
    simhash64: string;
    minhash: string[];
  }>;
};

export type EventTimelineEntry = {
  newsItemId: string;
  sourceId: string;
  sourceClass: SourceClass;
  title: string;
  observedAt: string;
  publishedAt?: string;
  occurredAt?: string;
  canonicalUrl?: string;
  publisherName?: string;
  role: "representative" | "corroborating" | "contradicting";
};

export type EventItem = {
  id: string;
  marketId: string | null;
  timestamp: string;
  kind: EventItemKind;
  title: string;
  summary: string;
  source: TerminalDataSourceRef;
  impact: EventImpact;
  importance: number;
  clusterKey?: string;
  abstract?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  occurredAt?: string;
  timePrecision?: "minute" | "hour" | "day" | "unknown";
  sourceCount?: number;
  sourceMix?: SourceClass[];
  primaryEntityRefs?: EntityRef[];
  geo?: GeoRef[];
  topics?: string[];
  sentiment?: SentimentScore;
  credibility?: (RuleScore & { reasons: string[] });
  sourceDiversityScore?: number;
  noveltyScore?: number;
  lifecycleStatus?: EventClusterLifecycleStatus;
  rumorStatus?: EventRumorStatus;
  contradictions?: EventContradiction[];
  textSignature?: EventTextSignature;
  timeline?: EventTimelineEntry[];
  representativeNewsItemId?: string;
  memberNewsItemIds?: string[];
  provenance?: ProvenanceRef[];
};

export type AlertKind =
  | "probability_cross"
  | "probability_jump"
  | "volume_spike"
  | "whale_activity"
  | "watched_market";

export type AlertRule = {
  id: string;
  marketId: string | null;
  name: string;
  kind: AlertKind;
  threshold: number;
  windowMinutes: number | null;
  enabled: boolean;
  createdAt: string;
};

export type AlertEvent = {
  id: string;
  ruleId: string;
  marketId: string | null;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;
  read: boolean;
};

export type MarketScores = {
  volatilityScore: number;
  momentumScore: number;
  unusualVolumeScore: number;
  whaleConvictionScore: number;
  importanceScore: number;
};

export type MoveCorrelationMatch = {
  itemId: string;
  kind: "event" | "wallet";
  title: string;
  timestamp: string;
  score: number;
  reason: string;
};

export type MoveCorrelation = {
  moveId: string;
  direction: EventImpact;
  score: number;
  summary: string;
  matches: MoveCorrelationMatch[];
};

export type MarketSource = {
  id: string;
  label: string;
  mode: MarketSourceMode;
  readOnly: boolean;
  listMarkets: (query?: MarketSourceMarketQuery) => Promise<Market[]>;
  getMarket: (marketId: string) => Promise<Market | null>;
  listMoves: (marketId?: string | null) => Promise<MarketMove[]>;
  listWalletActivity: (query?: MarketSourceActivityQuery) => Promise<WalletActivity[]>;
  listEvents: (query?: MarketSourceEventQuery) => Promise<EventItem[]>;
  listAlertRules: () => Promise<AlertRule[]>;
  listAlertEvents: () => Promise<AlertEvent[]>;
  status: () => Promise<MarketSourceStatus>;
};
