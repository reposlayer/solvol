import type {
  ConfidenceLabel,
  EventClusterLifecycleStatus,
  EventContradiction,
  EventImpact,
  EventItem,
  EventItemKind,
  EventMarketLink,
  EventRumorStatus,
  EventTextSignature,
  EventTimelineEntry,
  EntityRef,
  GeoRef,
  Market,
  MarketMove,
  NewsItem,
  SentimentLabel,
  SourceClass,
  WhyMovedCandidate,
  WhyMovedDirection,
  WhyMovedEvidenceStatus,
  WhyMovedMarketDivergence,
  WhyMovedMoveQuality,
  WhyMovedMoveQualityLabel,
  WhyMovedScoreBreakdown,
} from "./types";
import {
  classifyMarketFamily,
  inferMarketFamilyDirection,
} from "./market-family.ts";
import { normalizeSourceUrl, sha256Hex, stableJson } from "./source-registry.ts";

type ClusterOpts = {
  now?: string;
};

export type NearDuplicateTextSignature = Omit<EventTextSignature, "memberSignatures">;

type ExplainWhyMovedInput = {
  market: Market;
  events: EventItem[];
  moves: MarketMove[];
  createdAt?: string;
};

type TextScoreInput = {
  headline: string;
  summary?: string | null;
  body?: string | null;
  sourceClass: SourceClass;
};

type CredibilityOpts = {
  sourceClass: SourceClass;
  canonicalUrl?: string;
  publisherDomain?: string;
  corroborationCount?: number;
  contradictedByFactcheck?: boolean;
};

const MARKET_TERM_ALIASES: Array<{ rx: RegExp; entity: EntityRef }> = [
  {
    rx: /\bfederal reserve\b|\bfomc\b|\bfed\b/i,
    entity: { kind: "org", canonicalName: "Federal Reserve", aliases: ["Fed", "FOMC"], confidence: 0.95 },
  },
  {
    rx: /\bapple\b|\baapl\b/i,
    entity: { kind: "ticker", canonicalName: "AAPL", aliases: ["Apple Inc.", "Apple"], confidence: 0.9 },
  },
  {
    rx: /\bbitcoin\b|\bbtc\b/i,
    entity: { kind: "token", canonicalName: "BTC", aliases: ["Bitcoin"], confidence: 0.9 },
  },
  {
    rx: /\bcisa\b|\bcybersecurity and infrastructure security agency\b/i,
    entity: { kind: "org", canonicalName: "CISA", aliases: ["Cybersecurity and Infrastructure Security Agency"], confidence: 0.9 },
  },
  {
    rx: /\busgs\b|\bunited states geological survey\b/i,
    entity: { kind: "org", canonicalName: "USGS", aliases: ["United States Geological Survey"], confidence: 0.9 },
  },
  {
    rx: /\btaiwan\b|\bhualien\b/i,
    entity: { kind: "place", canonicalName: "Taiwan", aliases: ["Hualien"], confidence: 0.82 },
  },
  {
    rx: /\b8-k\b|\b10-k\b|\b10-q\b|\bs-1\b/i,
    entity: { kind: "form", canonicalName: "SEC filing", aliases: ["8-K", "10-K", "10-Q", "S-1"], confidence: 0.8 },
  },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoMinusMinutes(iso: string, minutes: number): string {
  const parsed = parseTime(iso);
  return new Date(parsed - minutes * 60_000).toISOString();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  const stop = new Set(["will", "the", "and", "for", "with", "from", "this", "that", "market", "2026", "before", "after"]);
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function textShingles(tokens: string[], size = 3): string[] {
  if (tokens.length === 0) return [];
  if (tokens.length <= size) return [tokens.join(" ")];
  const shingles: string[] = [];
  for (let index = 0; index <= tokens.length - size; index++) {
    shingles.push(tokens.slice(index, index + size).join(" "));
  }
  return Array.from(new Set(shingles));
}

function first64BitsHex(value: string): string {
  return sha256Hex(value).slice(0, 16);
}

function simhash64(shingles: string[]): string {
  const vector = Array.from({ length: 64 }, () => 0);
  for (const shingle of shingles) {
    const hash = BigInt(`0x${first64BitsHex(shingle)}`);
    for (let bit = 0; bit < 64; bit++) {
      const mask = BigInt(1) << BigInt(bit);
      vector[bit] += (hash & mask) === BigInt(0) ? -1 : 1;
    }
  }
  let result = BigInt(0);
  for (let bit = 0; bit < 64; bit++) {
    if (vector[bit] >= 0) result |= BigInt(1) << BigInt(bit);
  }
  return result.toString(16).padStart(16, "0");
}

function minhash(shingles: string[], count = 8): string[] {
  return shingles
    .map(first64BitsHex)
    .sort()
    .slice(0, count);
}

function hammingDistance64(a: string, b: string): number {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let distance = 0;
  while (value > BigInt(0)) {
    distance += Number(value & BigInt(1));
    value >>= BigInt(1);
  }
  return distance;
}

function minhashOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  const overlap = b.filter((item) => set.has(item)).length;
  return overlap / Math.min(a.length, b.length);
}

function tokenOverlap(a: NewsItem, b: NewsItem): number {
  const left = new Set(tokenize(`${a.headline} ${a.summary ?? ""} ${a.body ?? ""}`));
  const right = tokenize(`${b.headline} ${b.summary ?? ""} ${b.body ?? ""}`);
  if (left.size === 0 || right.length === 0) return 0;
  const overlap = right.filter((token) => left.has(token)).length;
  return overlap / Math.min(left.size, right.length);
}

function confidenceLabel(score: number): ConfidenceLabel {
  return score >= 0.8 ? "high" : score >= 0.55 ? "medium" : "low";
}

function sentimentLabel(score: number): SentimentLabel {
  if (Math.abs(score) < 0.15) return "neutral";
  if (score > 0.15) return "positive";
  if (score < -0.15) return "negative";
  return "mixed";
}

export function slugifySourceText(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 96) || "untitled";
}

export function buildNewsFingerprint(input: {
  headline: string;
  body?: string | null;
  summary?: string | null;
  publishedAt?: string;
}): string {
  const base = normalizeText(`${input.headline} ${(input.body ?? input.summary ?? "").slice(0, 260)}`);
  const bucket = input.publishedAt ? input.publishedAt.slice(0, 13) : "";
  return sha256Hex(`${base}|${bucket}`);
}

export function buildNearDuplicateTextSignature(item: NewsItem): NearDuplicateTextSignature {
  const tokens = tokenize(`${item.headline} ${item.summary ?? ""} ${item.body ?? ""}`);
  const shingles = textShingles(tokens);
  return {
    algorithm: "simhash64/minhash-v1",
    simhash64: simhash64(shingles),
    minhash: minhash(shingles),
    shingleCount: shingles.length,
  };
}

export function scoreSentiment(input: TextScoreInput) {
  let score = 0;
  const ruleIds: string[] = [];
  const text = normalizeText(`${input.headline} ${input.summary ?? ""} ${input.body ?? ""}`);
  const positive = [
    /approved?/,
    /wins?/,
    /passes?/,
    /raised guidance/,
    /beats? estimates/,
    /launch(ed)?/,
    /lower/,
    /surge/,
  ];
  const negative = [
    /denied?/,
    /blocked?/,
    /cuts? guidance/,
    /miss(ed|es)? estimates/,
    /hacked?/,
    /investigation/,
    /lawsuit/,
    /default/,
    /delayed?/,
    /exploitation/,
  ];

  for (const rx of positive) {
    if (rx.test(text)) {
      score += 0.2;
      ruleIds.push(`sent_pos:${rx}`);
    }
  }
  for (const rx of negative) {
    if (rx.test(text)) {
      score -= 0.2;
      ruleIds.push(`sent_neg:${rx}`);
    }
  }
  if (input.sourceClass === "official") score *= 0.9;
  return { label: sentimentLabel(score), score: clamp01((score + 1) / 2) * 2 - 1, ruleIds };
}

export function scoreCredibility(opts: CredibilityOpts) {
  let score =
    opts.sourceClass === "market" ? 0.95 :
    opts.sourceClass === "official" ? 0.95 :
    opts.sourceClass === "onchain" ? 0.92 :
    opts.sourceClass === "rss" ? 0.8 :
    opts.sourceClass === "news_api" ? 0.65 :
    opts.sourceClass === "factcheck" ? 0.9 :
    opts.sourceClass === "social" ? 0.4 : 0.5;
  const reasons = [`base:${opts.sourceClass}`];
  const ruleIds = [`cred:base:${opts.sourceClass}`];

  if (opts.canonicalUrl) {
    score += 0.03;
    reasons.push("has_canonical_url");
    ruleIds.push("cred:has_canonical_url");
  }
  if (opts.publisherDomain) {
    score += 0.02;
    reasons.push("has_publisher_domain");
    ruleIds.push("cred:has_publisher_domain");
  }
  if ((opts.corroborationCount ?? 0) >= 2) {
    score += 0.08;
    reasons.push("corroborated_2plus");
    ruleIds.push("cred:corroborated_2plus");
  }
  if ((opts.corroborationCount ?? 0) >= 4) {
    score += 0.05;
    reasons.push("corroborated_4plus");
    ruleIds.push("cred:corroborated_4plus");
  }
  if (opts.contradictedByFactcheck) {
    score -= 0.25;
    reasons.push("contradicted_by_factcheck");
    ruleIds.push("cred:contradicted_by_factcheck");
  }

  const bounded = clamp01(score);
  return { score: bounded, label: confidenceLabel(bounded), reasons, ruleIds };
}

export function extractEntityRefs(text: string): EntityRef[] {
  const refs: EntityRef[] = [];
  const seen = new Set<string>();
  for (const item of MARKET_TERM_ALIASES) {
    if (!item.rx.test(text)) continue;
    const key = `${item.entity.kind}:${item.entity.canonicalName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ ...item.entity });
  }
  return refs;
}

export function extractGeoRefs(text: string, countryCode?: string): GeoRef[] {
  const refs: GeoRef[] = [];
  if (/\btaiwan\b|\bhualien\b/i.test(text)) {
    refs.push({
      name: "Taiwan",
      countryCode: "TW",
      lat: 23.9,
      lon: 121.6,
      confidence: 0.86,
      source: "explicit",
    });
  }
  if (countryCode && refs.length === 0) {
    refs.push({
      name: countryCode,
      countryCode,
      confidence: 0.55,
      source: "source-country",
    });
  }
  return refs;
}

export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  const byKey = new Map<string, NewsItem>();
  for (const item of items) {
    const canonicalUrl = normalizeSourceUrl(item.canonicalUrl ?? item.sourceUrl);
    const key = canonicalUrl ? `url:${canonicalUrl}` : `fp:${item.dedupeFingerprint}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, canonicalUrl: canonicalUrl ?? item.canonicalUrl });
      continue;
    }
    byKey.set(key, {
      ...existing,
      provenance: [...existing.provenance, ...item.provenance],
      topics: Array.from(new Set([...(existing.topics ?? []), ...(item.topics ?? [])])),
      entities: mergeEntities(existing.entities, item.entities),
    });
  }
  return [...byKey.values()].sort((a, b) => parseTime(b.publishedAt ?? b.observedAt) - parseTime(a.publishedAt ?? a.observedAt));
}

function mergeEntities(a: EntityRef[], b: EntityRef[]): EntityRef[] {
  const byKey = new Map<string, EntityRef>();
  for (const entity of [...a, ...b]) {
    const key = `${entity.kind}:${entity.canonicalName}`;
    const existing = byKey.get(key);
    byKey.set(key, existing && existing.confidence >= entity.confidence ? existing : entity);
  }
  return [...byKey.values()];
}

function clusterKeyForNews(item: NewsItem): string {
  const entity = item.entities[0]?.canonicalName ?? item.topics?.[0] ?? item.publisherDomain ?? item.sourceId;
  const tokens = tokenize(item.headline).slice(0, 5).join("-");
  const timeBucket = (item.occurredAt ?? item.publishedAt ?? item.observedAt).slice(0, 13);
  return slugifySourceText(`${entity}-${tokens}-${timeBucket}`);
}

function clusterContextKey(item: NewsItem): string {
  const entity = item.entities[0]?.canonicalName ?? item.topics?.[0] ?? item.publisherDomain ?? item.sourceId;
  const timeBucket = (item.occurredAt ?? item.publishedAt ?? item.observedAt).slice(0, 13);
  return slugifySourceText(`${entity}-${timeBucket}`);
}

function hasSharedClusterContext(a: NewsItem, b: NewsItem): boolean {
  const aEntities = new Set(a.entities.map((entity) => `${entity.kind}:${entity.canonicalName}`));
  const bEntities = new Set(b.entities.map((entity) => `${entity.kind}:${entity.canonicalName}`));
  const entityOverlap = [...aEntities].some((entity) => bEntities.has(entity));
  const aTopics = new Set(a.topics ?? []);
  const topicOverlap = (b.topics ?? []).some((topic) => aTopics.has(topic));
  const aTime = parseTime(a.occurredAt ?? a.publishedAt ?? a.observedAt);
  const bTime = parseTime(b.occurredAt ?? b.publishedAt ?? b.observedAt);
  const withinTwoHours = Math.abs(aTime - bTime) <= 2 * 60 * 60 * 1000;
  return withinTwoHours && (entityOverlap || topicOverlap || a.publisherDomain === b.publisherDomain);
}

function isNearDuplicate(a: NewsItem, b: NewsItem): boolean {
  if (!hasSharedClusterContext(a, b)) return false;
  const left = buildNearDuplicateTextSignature(a);
  const right = buildNearDuplicateTextSignature(b);
  return hammingDistance64(left.simhash64, right.simhash64) <= 24 ||
    minhashOverlap(left.minhash, right.minhash) >= 0.25 ||
    tokenOverlap(a, b) >= 0.35;
}

function eventKindForMembers(items: NewsItem[]): EventItemKind {
  if (items.some((item) => item.sourceId === "sec-rss")) return "official_filing";
  if (items.some((item) => item.sourceId === "federal-reserve-rss")) return "official_statement";
  if (items.some((item) => item.sourceId === "usgs-earthquakes")) return "breaking_news";
  if (items.some((item) => item.sourceClass === "official")) return "official_statement";
  if (items.some((item) => item.sourceClass === "onchain")) return "onchain_activity";
  if (items.some((item) => item.sourceClass === "social")) return "social_rumor";
  if (items.some((item) => item.sourceClass === "factcheck")) return "factcheck";
  return "breaking_news";
}

function impactForSentiment(label: SentimentLabel): EventImpact {
  if (label === "positive") return "up";
  if (label === "negative") return "down";
  return "neutral";
}

function fixed4(value: number): number {
  return Number(clamp01(value).toFixed(4));
}

function sourceDiversityScore(members: NewsItem[]): number {
  if (members.length <= 1) return 0;
  const uniqueSources = new Set(members.map((item) => item.publisherDomain ?? item.sourceId)).size;
  const uniqueClasses = new Set(members.map((item) => item.sourceClass)).size;
  const sourceComponent = Math.min(1, (uniqueSources - 1) / 3) * 0.65;
  const classComponent = Math.min(1, (uniqueClasses - 1) / 3) * 0.35;
  return fixed4(sourceComponent + classComponent);
}

function noveltyScore(members: NewsItem[]): number {
  const uniqueFingerprints = new Set(members.map((item) => item.dedupeFingerprint)).size;
  if (members.length === 0) return 0;
  return fixed4(uniqueFingerprints / members.length);
}

function isFactCheckRefutation(item: NewsItem): boolean {
  if (item.sourceClass !== "factcheck") return false;
  const text = normalizeText(`${item.headline} ${item.summary ?? ""} ${item.body ?? ""}`);
  return /\b(no evidence|false|did not|not true|debunk|debunked|misleading|unsupported|unfounded|hoax)\b/.test(text);
}

function detectContradictions(members: NewsItem[]): EventContradiction[] {
  const claimItems = members.filter((item) => item.sourceClass !== "factcheck");
  const contradictions: EventContradiction[] = [];
  for (const factcheck of members.filter(isFactCheckRefutation)) {
    const contradictedNewsItemIds = claimItems
      .filter((item) => hasSharedClusterContext(factcheck, item) || tokenOverlap(factcheck, item) >= 0.2)
      .map((item) => item.id)
      .sort();
    if (contradictedNewsItemIds.length === 0) continue;
    contradictions.push({
      id: `contradiction-${sha256Hex(`${factcheck.id}|${contradictedNewsItemIds.join("|")}`).slice(0, 18)}`,
      kind: "factcheck_refutes",
      contradictingNewsItemId: factcheck.id,
      contradictedNewsItemIds,
      confidence: fixed4(Math.max(0.65, factcheck.credibility.score)),
      reason: "factcheck_refutes_related_claim",
      ruleId: "cluster:contradiction:factcheck_refutes",
    });
  }
  return contradictions.sort((a, b) => a.id.localeCompare(b.id));
}

function rumorStatusForMembers(
  members: NewsItem[],
  contradictions: EventContradiction[],
  diversityScore: number,
): EventRumorStatus {
  const hasSocial = members.some((item) => item.sourceClass === "social");
  if (!hasSocial) return "not_rumor";
  if (contradictions.some((item) => item.kind === "factcheck_refutes")) return "refuted";
  if (contradictions.length > 0) return "contested";
  return diversityScore >= 0.5 ? "corroborated" : "unverified";
}

function lifecycleStatusForCluster(
  members: NewsItem[],
  contradictions: EventContradiction[],
  diversityScore: number,
  rumorStatus: EventRumorStatus,
): EventClusterLifecycleStatus {
  if (rumorStatus === "refuted") return "refuted";
  if (contradictions.length > 0 || rumorStatus === "contested") return "contested";
  if (diversityScore >= 0.5 || members.length >= 3 || rumorStatus === "corroborated") return "corroborated";
  if (members.length > 1) return "developing";
  return "new";
}

function newsItemTime(item: NewsItem): number {
  return parseTime(item.occurredAt ?? item.publishedAt ?? item.observedAt);
}

function compareNewsChronological(a: NewsItem, b: NewsItem): number {
  return newsItemTime(a) - newsItemTime(b) || a.id.localeCompare(b.id);
}

function compareNewsObserved(a: NewsItem, b: NewsItem): number {
  return parseTime(a.observedAt) - parseTime(b.observedAt) || a.id.localeCompare(b.id);
}

function compareRepresentativeNews(a: NewsItem, b: NewsItem): number {
  return b.credibility.score - a.credibility.score ||
    newsItemTime(b) - newsItemTime(a) ||
    a.id.localeCompare(b.id);
}

function buildEventTimeline(
  members: NewsItem[],
  representative: NewsItem,
  contradictions: EventContradiction[],
): EventTimelineEntry[] {
  const contradictingIds = new Set(contradictions.map((item) => item.contradictingNewsItemId));
  return [...members].sort(compareNewsChronological).map((item) => ({
    newsItemId: item.id,
    sourceId: item.sourceId,
    sourceClass: item.sourceClass,
    title: item.headline,
    observedAt: item.observedAt,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    ...(item.occurredAt ? { occurredAt: item.occurredAt } : {}),
    ...(item.canonicalUrl ? { canonicalUrl: item.canonicalUrl } : {}),
    ...(item.publisherName ? { publisherName: item.publisherName } : {}),
    role: contradictingIds.has(item.id)
      ? "contradicting"
      : item.id === representative.id
        ? "representative"
        : "corroborating",
  }));
}

function clusterKeyForMembers(members: NewsItem[]): string {
  const representative = [...members].sort(compareRepresentativeNews)[0]!;
  const contextKeys = Array.from(new Set(members.map(clusterContextKey))).sort();
  const memberSignatureSeed = members
    .map((item) => {
      const signature = buildNearDuplicateTextSignature(item);
      return `${signature.simhash64}:${signature.minhash.join(",")}:${item.dedupeFingerprint}`;
    })
    .sort()
    .join("|");
  const signatureHash = sha256Hex(`${contextKeys.join("|")}|${memberSignatureSeed}`).slice(0, 12);
  return slugifySourceText(`${clusterContextKey(representative)}-${signatureHash}`);
}

function buildCluster(members: NewsItem[]): EventItem {
  const stableKey = clusterKeyForMembers(members);
  const sortedByObserved = [...members].sort(compareNewsObserved);
  const representative = [...members].sort(compareRepresentativeNews)[0]!;
  const firstSeenAt = sortedByObserved[0]!.observedAt;
  const lastSeenAt = sortedByObserved[sortedByObserved.length - 1]!.observedAt;
  const sourceMix = Array.from(new Set(members.map((item) => item.sourceClass)));
  const memberNewsItemIds = members.map((item) => item.id).sort();
  const provenance = members.flatMap((item) => item.provenance);
  const avgCredibility = members.reduce((sum, item) => sum + item.credibility.score, 0) / members.length;
  const eventId = `event-${sha256Hex(`${stableKey}|${memberNewsItemIds.join("|")}`).slice(0, 18)}`;
  const memberSignatures = members
    .map((item) => ({ newsItemId: item.id, ...buildNearDuplicateTextSignature(item) }))
    .sort((a, b) => a.newsItemId.localeCompare(b.newsItemId));
  const clusterSignature = buildNearDuplicateTextSignature(representative);
  const contradictions = detectContradictions(members);
  const diversityScore = sourceDiversityScore(members);
  const clusterNoveltyScore = noveltyScore(members);
  const rumorStatus = rumorStatusForMembers(members, contradictions, diversityScore);
  const lifecycleStatus = lifecycleStatusForCluster(members, contradictions, diversityScore, rumorStatus);
  const timeline = buildEventTimeline(members, representative, contradictions);

  return {
    id: eventId,
    clusterKey: stableKey,
    kind: eventKindForMembers(members),
    marketId: null,
    timestamp: representative.occurredAt ?? representative.publishedAt ?? representative.observedAt,
    title: representative.headline,
    summary: representative.summary ?? representative.body ?? representative.headline,
    abstract: representative.summary ?? representative.body ?? representative.headline,
    source: {
      id: representative.sourceId,
      label: representative.publisherName ?? representative.sourceId,
      kind: "external",
      url: representative.sourceUrl ?? representative.canonicalUrl,
    },
    impact: impactForSentiment(representative.sentiment.label),
    importance: Math.round(avgCredibility * 100),
    firstSeenAt,
    lastSeenAt,
    occurredAt: representative.occurredAt ?? representative.publishedAt,
    timePrecision: "minute",
    sourceCount: members.length,
    sourceMix,
    primaryEntityRefs: members.reduce<EntityRef[]>((acc, item) => mergeEntities(acc, item.entities), []).slice(0, 8),
    geo: members.flatMap((item) => item.geo ?? []).slice(0, 6),
    topics: Array.from(new Set(members.flatMap((item) => item.topics ?? []))).slice(0, 12),
    sentiment: representative.sentiment,
    credibility: {
      score: avgCredibility,
      label: confidenceLabel(avgCredibility),
      reasons: Array.from(new Set(members.flatMap((item) => item.credibility.reasons))),
      ruleIds: Array.from(new Set(members.flatMap((item) => item.credibility.ruleIds))),
    },
    sourceDiversityScore: diversityScore,
    noveltyScore: clusterNoveltyScore,
    lifecycleStatus,
    rumorStatus,
    contradictions,
    textSignature: {
      algorithm: "simhash64/minhash-v1",
      simhash64: clusterSignature.simhash64,
      minhash: clusterSignature.minhash,
      shingleCount: memberSignatures.reduce((sum, signature) => sum + signature.shingleCount, 0),
      memberSignatures: memberSignatures.map((signature) => ({
        newsItemId: signature.newsItemId,
        simhash64: signature.simhash64,
        minhash: signature.minhash,
      })),
    },
    timeline,
    representativeNewsItemId: representative.id,
    memberNewsItemIds,
    provenance,
  };
}

export function clusterNewsItems(items: NewsItem[], opts: ClusterOpts = {}): EventItem[] {
  void opts;
  const groups: Array<{ key: string; members: NewsItem[] }> = [];
  for (const item of items) {
    const exactKey = clusterKeyForNews(item);
    const existing = groups.find((group) =>
      group.key === exactKey ||
      group.members.some((member) => isNearDuplicate(item, member)),
    );
    if (existing) {
      existing.members.push(item);
      existing.key = slugifySourceText(`${clusterContextKey(item)}-${buildNearDuplicateTextSignature(existing.members[0]!).simhash64.slice(0, 8)}`);
      continue;
    }
    groups.push({ key: exactKey, members: [item] });
  }
  return groups
    .map(({ members }) => buildCluster(members))
    .sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp));
}

export function replayEventCluster(event: EventItem, newsItems: NewsItem[]): EventItem {
  const members = newsItems.filter((item) => event.memberNewsItemIds?.includes(item.id));
  if (members.length === 0) return { ...event };
  return buildCluster(members);
}

function marketSlug(market: Market): string {
  if (market.url) {
    try {
      return new URL(market.url).pathname.split("/").filter(Boolean).at(-1) ?? slugifySourceText(market.title);
    } catch {
      return slugifySourceText(market.title);
    }
  }
  return slugifySourceText(market.title);
}

function impactDirection(event: EventItem): WhyMovedDirection {
  if (event.impact === "up") return "yes";
  if (event.impact === "down") return "no";
  return "unclear";
}

function observedMoveDirection(move: MarketMove): WhyMovedDirection {
  const diff = move.probabilityAfter - move.probabilityBefore;
  if (Math.abs(diff) < 0.005) return "unclear";
  return diff > 0 ? "yes" : "no";
}

function inferDirection(event: EventItem, market: Market): {
  direction: WhyMovedDirection;
  reason: string;
  ruleId: string;
} {
  const eventText = normalizeText(`${event.title} ${event.abstract ?? event.summary}`);
  const byImpact = impactDirection(event);
  return inferMarketFamilyDirection({
    classification: classifyMarketFamily({
      question: market.title,
      description: market.description,
      resolutionRules: market.resolutionRules,
      event: market.event,
      category: market.category,
    }),
    eventText,
    fallbackDirection: byImpact,
  });
}

function marketLinkText(market: Market): string {
  return normalizeText(`${market.title} ${market.event} ${market.category} ${market.description} ${market.resolutionRules}`);
}

function eventLinkText(event: EventItem): string {
  return normalizeText(`${event.title} ${event.abstract ?? event.summary} ${(event.topics ?? []).join(" ")}`);
}

export function linkEventToMarket(event: EventItem, market: Market): EventMarketLink {
  let explicitMarket = 0;
  let lexical = 0;
  let entity = 0;
  let topic = 0;
  let penalties = 0;
  const reasons: string[] = [];
  const ruleIds: string[] = [];
  const marketText = marketLinkText(market);
  const eventText = eventLinkText(event);

  if (event.marketId === market.id) {
    explicitMarket = 0.6;
    reasons.push("explicit_market_id");
    ruleIds.push("why:link:explicit_market_id");
  } else if (event.marketId) {
    penalties += 0.45;
    reasons.push("different_explicit_market_id");
    ruleIds.push("why:link:penalty:different_market_id");
  }

  const marketSlugText = slugifySourceText(marketSlug(market)).replace(/-/g, " ");
  if (marketSlugText && eventText.includes(marketSlugText)) {
    lexical += 0.35;
    reasons.push("market_slug_hit");
    ruleIds.push("why:link:slug");
  }

  const overlap = new Set(tokenize(marketText).filter((token) => eventText.includes(token)));
  if (overlap.size > 0) {
    lexical += Math.min(0.35, 0.08 * overlap.size);
    reasons.push("market_event_token_overlap");
    ruleIds.push("why:link:token_overlap");
  }

  const entityHits = (event.primaryEntityRefs ?? []).filter((ref) =>
    marketText.includes(normalizeText(ref.canonicalName)) ||
    ref.aliases.some((alias) => marketText.includes(normalizeText(alias))),
  );
  if (entityHits.length > 0) {
    entity += Math.min(0.35, entityHits.length * 0.18);
    reasons.push("entity_overlap");
    ruleIds.push("why:link:entity_overlap");
  }

  const topicHits = (event.topics ?? []).filter((item) => marketText.includes(normalizeText(item)));
  if (topicHits.length > 0) {
    topic += Math.min(0.2, topicHits.length * 0.08);
    reasons.push("topic_overlap");
    ruleIds.push("why:link:topic_overlap");
  }

  const score = Number(clamp01(explicitMarket + lexical + entity + topic - penalties).toFixed(4));
  const hasDeterministicLinkEvidence = explicitMarket > 0 || entity > 0 || lexical >= 0.16 || topic >= 0.1;
  const status = score >= 0.2 && hasDeterministicLinkEvidence
    ? "linked"
    : score >= 0.1
      ? "weak"
      : "unrelated";

  return {
    eventId: event.id,
    marketId: market.id,
    status,
    score,
    components: {
      explicitMarket,
      lexical: Number(lexical.toFixed(4)),
      entity: Number(entity.toFixed(4)),
      topic: Number(topic.toFixed(4)),
      penalties: Number(penalties.toFixed(4)),
    },
    reasons,
    ruleIds: ruleIds.length > 0 ? ruleIds : ["why:link:unrelated"],
  };
}

export function linkEventsToMarkets(events: EventItem[], markets: Market[]): EventMarketLink[] {
  return events
    .flatMap((event) => markets.map((market) => linkEventToMarket(event, market)))
    .sort((a, b) =>
      b.score - a.score ||
      a.marketId.localeCompare(b.marketId) ||
      a.eventId.localeCompare(b.eventId)
    );
}

function scoreEventAgainstMarket(event: EventItem, market: Market, move: MarketMove): {
  confidence: number;
  scoreBreakdown: WhyMovedScoreBreakdown;
  reasons: string[];
  ruleIds: string[];
} {
  let lexical = 0;
  let entity = 0;
  let time = 0;
  let source = 0;
  let corroboration = 0;
  let marketReaction = 0;
  let penalties = 0;
  const reasons: string[] = [];
  const ruleIds: string[] = [];
  const marketText = normalizeText(`${market.title} ${market.event} ${market.description} ${market.resolutionRules}`);
  const eventText = normalizeText(`${event.title} ${event.abstract ?? event.summary} ${(event.topics ?? []).join(" ")}`);

  const overlap = new Set(tokenize(marketText).filter((token) => eventText.includes(token)));
  if (eventText.includes(slugifySourceText(marketSlug(market)).replace(/-/g, " "))) {
    lexical += 0.35;
    reasons.push("slug_hit");
    ruleIds.push("why:lexical:slug");
  }
  if (overlap.size > 0) {
    lexical += Math.min(0.35, 0.08 * overlap.size);
    reasons.push("question_token_overlap");
    ruleIds.push("why:lexical:token_overlap");
  }

  const entities = event.primaryEntityRefs ?? [];
  const entityHits = entities.filter((ref) => marketText.includes(normalizeText(ref.canonicalName)) || ref.aliases.some((alias) => marketText.includes(normalizeText(alias))));
  if (entityHits.length > 0) {
    entity += Math.min(0.25, entityHits.length * 0.1);
    reasons.push("entity_overlap");
    ruleIds.push("why:entity:overlap");
  }

  const eventTime = parseTime(event.occurredAt ?? event.firstSeenAt ?? event.timestamp);
  const moveTime = parseTime(move.timestamp);
  const windowMs = Math.max(1, move.windowMinutes) * 60_000;
  const delta = Math.abs(eventTime - moveTime);
  if (delta <= windowMs * 2) {
    time += Math.max(0.05, 0.2 * (1 - Math.min(delta, windowMs * 2) / (windowMs * 2)));
    reasons.push("time_window_match");
    ruleIds.push("why:time:window");
  }

  const credibility = event.credibility?.score ?? event.importance / 100;
  if (credibility >= 0.85) {
    source += 0.2;
    reasons.push("high_credibility");
    ruleIds.push("why:source:high_credibility");
  } else if (credibility >= 0.6) {
    source += 0.1;
    reasons.push("medium_credibility");
    ruleIds.push("why:source:medium_credibility");
  }

  const sourceCount = event.sourceCount ?? 1;
  if (sourceCount >= 2) {
    corroboration += 0.1;
    reasons.push("multi_source");
    ruleIds.push("why:corroboration:multi_source");
  }
  if (sourceCount >= 4) {
    corroboration += 0.05;
    reasons.push("wide_confirmation");
    ruleIds.push("why:corroboration:wide");
  }
  if ((event.sourceDiversityScore ?? 0) >= 0.5) {
    corroboration += 0.05;
    reasons.push("source_diversity");
    ruleIds.push("why:corroboration:source_diversity");
  }

  const absMove = Math.abs(move.probabilityAfter - move.probabilityBefore);
  if (absMove >= 0.03) {
    marketReaction += 0.1;
    reasons.push("3c_move");
    ruleIds.push("why:market_reaction:3c");
  }
  if (absMove >= 0.07) {
    marketReaction += 0.1;
    reasons.push("7c_move");
    ruleIds.push("why:market_reaction:7c");
  }

  if (credibility < 0.5) {
    penalties += 0.15;
    reasons.push("low_credibility_penalty");
    ruleIds.push("why:penalty:low_credibility");
  }
  if (event.kind === "social_rumor" && sourceCount < 2) {
    penalties += 0.1;
    reasons.push("rumor_penalty");
    ruleIds.push("why:penalty:uncorroborated_rumor");
  }
  if ((event.contradictions ?? []).length > 0) {
    penalties += 0.2;
    reasons.push("contradictory_evidence");
    ruleIds.push("why:penalty:contradictory_evidence");
  }
  if (event.rumorStatus === "refuted" || event.lifecycleStatus === "refuted") {
    penalties += 0.15;
    reasons.push("refuted_rumor");
    ruleIds.push("why:penalty:refuted_rumor");
  }

  const confidence = clamp01(lexical + entity + time + source + corroboration + marketReaction - penalties);
  return {
    confidence,
    scoreBreakdown: { lexical, entity, time, source, corroboration, marketReaction, penalties },
    reasons,
    ruleIds,
  };
}

function moveQualityLabel(score: number): WhyMovedMoveQualityLabel {
  return score >= 0.72 ? "strong" : score >= 0.45 ? "medium" : "weak";
}

function moveVolumeScore(volumeUsd: number): number {
  if (volumeUsd >= 1_000_000) return 1;
  if (volumeUsd >= 250_000) return 0.8;
  if (volumeUsd >= 50_000) return 0.55;
  if (volumeUsd >= 10_000) return 0.3;
  if (volumeUsd > 0) return 0.15;
  return 0;
}

function moveTimingScore(event: EventItem, move: MarketMove): number {
  const eventTime = parseTime(event.occurredAt ?? event.firstSeenAt ?? event.timestamp);
  const moveTime = parseTime(move.timestamp);
  if (eventTime === 0 || moveTime === 0) return 0;
  const windowMs = Math.max(1, move.windowMinutes) * 60_000;
  const delta = Math.abs(eventTime - moveTime);
  if (delta <= windowMs) return fixed4(1 - (delta / windowMs) * 0.4);
  if (delta <= windowMs * 2) return fixed4(0.6 - ((delta - windowMs) / windowMs) * 0.4);
  return 0.05;
}

function scoreMoveQuality(event: EventItem, move: MarketMove): WhyMovedMoveQuality {
  const absMove = Math.abs(move.probabilityAfter - move.probabilityBefore);
  const magnitude = fixed4(absMove / 0.1);
  const volume = fixed4(moveVolumeScore(move.volumeUsd));
  const timing = moveTimingScore(event, move);
  const directionClarity = absMove >= 0.07 ? 1 : absMove >= 0.03 ? 0.7 : absMove >= 0.01 ? 0.4 : 0.1;
  const score = fixed4((magnitude * 0.4) + (volume * 0.2) + (timing * 0.25) + (directionClarity * 0.15));
  const label = moveQualityLabel(score);
  return {
    label,
    score,
    components: {
      magnitude,
      volume,
      timing,
      directionClarity,
    },
    ruleIds: [
      "why:move_quality:magnitude",
      "why:move_quality:volume",
      "why:move_quality:timing",
      "why:move_quality:direction_clarity",
      `why:move_quality:${label}`,
    ],
  };
}

function marketDivergenceForDirections(
  expectedDirection: WhyMovedDirection,
  observedDirection: WhyMovedDirection,
): WhyMovedMarketDivergence {
  const detected = expectedDirection !== "unclear" &&
    observedDirection !== "unclear" &&
    expectedDirection !== observedDirection;
  return {
    detected,
    expectedDirection,
    observedDirection,
    reason: detected ? "observed_move_opposes_inferred_event_direction" : undefined,
    ruleIds: detected ? ["why:market_divergence:opposes_expected"] : ["why:market_divergence:aligned_or_unclear"],
  };
}

function evidenceStatusForCandidate(opts: {
  confidence: number;
  event: EventItem;
  moveQuality: WhyMovedMoveQuality;
  marketDivergence: WhyMovedMarketDivergence;
}): { status: WhyMovedEvidenceStatus; reason: string; ruleId: string } {
  if ((opts.event.contradictions ?? []).length > 0 ||
    opts.event.rumorStatus === "refuted" ||
    opts.event.lifecycleStatus === "refuted") {
    return {
      status: "contradicted",
      reason: "evidence_status:contradicted",
      ruleId: "why:evidence:contradicted",
    };
  }
  if (opts.marketDivergence.detected) {
    return {
      status: "divergent_market",
      reason: "evidence_status:divergent_market",
      ruleId: "why:evidence:divergent_market",
    };
  }
  if (opts.confidence < 0.45 ||
    opts.moveQuality.label === "weak" ||
    (opts.event.kind === "social_rumor" && (opts.event.sourceCount ?? 1) < 2)) {
    return {
      status: "insufficient_evidence",
      reason: "evidence_status:insufficient_evidence",
      ruleId: "why:evidence:insufficient",
    };
  }
  return {
    status: "supported",
    reason: "evidence_status:supported",
    ruleId: "why:evidence:supported",
  };
}

export function explainWhyMoved(input: ExplainWhyMovedInput): WhyMovedCandidate[] {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const candidates: WhyMovedCandidate[] = [];
  for (const move of input.moves.filter((item) => item.marketId === input.market.id)) {
    for (const event of input.events) {
      const eventMarketLink = linkEventToMarket(event, input.market);
      if (eventMarketLink.status !== "linked") continue;
      const scored = scoreEventAgainstMarket(event, input.market, move);
      if (scored.confidence <= 0) continue;
      const direction = inferDirection(event, input.market);
      const observedDirection = observedMoveDirection(move);
      const marketDivergence = marketDivergenceForDirections(direction.direction, observedDirection);
      const moveQuality = scoreMoveQuality(event, move);
      const evidence = evidenceStatusForCandidate({
        confidence: scored.confidence,
        event,
        moveQuality,
        marketDivergence,
      });
      const absChange = Number(Math.abs(move.probabilityAfter - move.probabilityBefore).toFixed(6));
      const conflictingNewsItemIds = Array.from(
        new Set((event.contradictions ?? []).map((item) => item.contradictingNewsItemId)),
      ).sort();
      candidates.push({
        id: `why-${sha256Hex(`${input.market.id}|${event.id}|${move.id}`).slice(0, 18)}`,
        marketId: input.market.id,
        marketSlug: marketSlug(input.market),
        eventId: event.id,
        moveId: move.id,
        eventMarketLink,
        direction: direction.direction,
        evidenceStatus: evidence.status,
        confidence: Number(scored.confidence.toFixed(4)),
        scoreBreakdown: scored.scoreBreakdown,
        moveQuality,
        marketDivergence,
        observedPriceMove: {
          from: move.probabilityBefore,
          to: move.probabilityAfter,
          absChange,
          windowStart: isoMinusMinutes(move.timestamp, move.windowMinutes),
          windowEnd: move.timestamp,
        },
        reasons: [
          ...eventMarketLink.reasons,
          ...scored.reasons,
          direction.reason,
          evidence.reason,
          ...(marketDivergence.reason ? [marketDivergence.reason] : []),
        ],
        ruleIds: [
          ...eventMarketLink.ruleIds,
          ...scored.ruleIds,
          direction.ruleId,
          evidence.ruleId,
          ...moveQuality.ruleIds,
          ...(marketDivergence.detected ? marketDivergence.ruleIds : []),
        ],
        supportingNewsItemIds: event.memberNewsItemIds ?? [],
        conflictingNewsItemIds,
        createdAt,
      });
    }
  }
  return candidates.sort((a, b) =>
    b.confidence - a.confidence ||
    a.eventId.localeCompare(b.eventId) ||
    a.moveId.localeCompare(b.moveId)
  );
}

export function deterministicPayloadId(prefix: string, payload: unknown): string {
  return `${prefix}-${sha256Hex(stableJson(payload)).slice(0, 20)}`;
}
