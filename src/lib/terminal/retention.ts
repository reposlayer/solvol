export type TerminalRetentionDataset =
  | "raw_document"
  | "news_item"
  | "event_cluster"
  | "market_price";

export type TerminalRetentionPolicy = {
  dataset: TerminalRetentionDataset;
  retainDays: number;
  downsampleAfterDays?: number;
  downsampleBucketMinutes?: number;
  description: string;
};

export type TerminalRetentionPlanStep = {
  dataset: TerminalRetentionDataset;
  action: "retain_and_downsample_plan";
  cutoffIso: string;
  downsampleCutoffIso?: string;
  downsampleBucketMinutes?: number;
  description: string;
};

export type TerminalRetentionPlan = {
  readOnly: true;
  dryRun: true;
  plannedAt: string;
  steps: TerminalRetentionPlanStep[];
};

export type MarketPriceLike = {
  marketId: string;
  ts: string;
  probability: number;
  source: string;
};

export const TERMINAL_RETENTION_POLICIES: TerminalRetentionPolicy[] = [
  {
    dataset: "raw_document",
    retainDays: 180,
    description: "Retain immutable raw payload metadata long enough for audit and replay windows.",
  },
  {
    dataset: "news_item",
    retainDays: 365,
    description: "Retain normalized source documents for annual market-resolution review.",
  },
  {
    dataset: "event_cluster",
    retainDays: 365,
    description: "Retain clustered events and membership provenance for why-moved replay.",
  },
  {
    dataset: "market_price",
    retainDays: 730,
    downsampleAfterDays: 30,
    downsampleBucketMinutes: 60,
    description: "Retain public Polymarket price history and downsample older high-frequency points.",
  },
];

function isoMinusDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildTerminalRetentionPlan(opts: { now?: string } = {}): TerminalRetentionPlan {
  const plannedAt = opts.now ?? new Date().toISOString();
  return {
    readOnly: true,
    dryRun: true,
    plannedAt,
    steps: TERMINAL_RETENTION_POLICIES.map((policy) => ({
      dataset: policy.dataset,
      action: "retain_and_downsample_plan",
      cutoffIso: isoMinusDays(plannedAt, policy.retainDays),
      downsampleCutoffIso: policy.downsampleAfterDays
        ? isoMinusDays(plannedAt, policy.downsampleAfterDays)
        : undefined,
      downsampleBucketMinutes: policy.downsampleBucketMinutes,
      description: policy.description,
    })),
  };
}

function bucketStartMs(iso: string, bucketMinutes: number): number {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 0;
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000;
  return Math.floor(parsed / bucketMs) * bucketMs;
}

export function selectMarketPriceDownsamplePoints<T extends MarketPriceLike>(
  points: T[],
  opts: { bucketMinutes?: number } = {},
): T[] {
  const bucketMinutes = opts.bucketMinutes ?? 60;
  const byBucket = new Map<string, T>();

  for (const point of [...points].sort((a, b) =>
    a.marketId.localeCompare(b.marketId) ||
    a.source.localeCompare(b.source) ||
    Date.parse(a.ts) - Date.parse(b.ts),
  )) {
    const bucket = `${point.marketId}|${point.source}|${bucketStartMs(point.ts, bucketMinutes)}`;
    if (!byBucket.has(bucket)) byBucket.set(bucket, point);
  }

  return [...byBucket.values()];
}
