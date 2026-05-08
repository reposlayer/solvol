import type { MarketPriceRecord } from "./market-registry";

export type PolymarketPublicWebSocketChannel = {
  id: "market";
  endpoint: "wss://ws-subscriptions-clob.polymarket.com/ws/market";
  readOnly: true;
  requiresAuth: false;
  subscriptionType: "market";
  heartbeat: "client-ping";
};

export const POLYMARKET_PUBLIC_WEBSOCKET_CHANNELS: PolymarketPublicWebSocketChannel[] = [
  {
    id: "market",
    endpoint: "wss://ws-subscriptions-clob.polymarket.com/ws/market",
    readOnly: true,
    requiresAuth: false,
    subscriptionType: "market",
    heartbeat: "client-ping",
  },
];

export type PolymarketMarketStreamEventType =
  | "book"
  | "price_change"
  | "tick_size_change"
  | "last_trade_price"
  | "best_bid_ask"
  | "new_market"
  | "market_resolved";

export type PolymarketMarketStreamAsset = {
  assetId: string;
  marketId: string;
  outcome: "YES" | "NO";
  conditionId?: string;
};

export type PolymarketMarketSubscription = {
  assets_ids: string[];
  type: "market";
  custom_feature_enabled: true;
};

export type PolymarketMarketStreamCheckpoint = {
  sourceId: "polymarket-public";
  channel: "market";
  marketId: string;
  conditionId?: string;
  assetId: string;
  outcome: "YES" | "NO";
  eventType: PolymarketMarketStreamEventType;
  observedAt: string;
  messageTimestamp: string;
  sequence: number;
  hash?: string;
  cursor: {
    after: string;
  };
};

export type PolymarketMarketStreamNormalizedMessage = {
  checkpoint: PolymarketMarketStreamCheckpoint;
  priceRecord?: MarketPriceRecord;
  spread?: number;
  size?: number;
  raw: Record<string, unknown>;
};

export type PolymarketMarketStreamConsumer = {
  open: () => void;
  heartbeat: () => void;
  receive: (payload: string | Record<string, unknown>) => PolymarketMarketStreamNormalizedMessage | null;
  subscribe: (assets: PolymarketMarketStreamAsset[]) => void;
  unsubscribe: (assetIds: string[]) => void;
};

export function buildPolymarketMarketSubscription(
  assets: PolymarketMarketStreamAsset[],
): PolymarketMarketSubscription {
  return {
    assets_ids: Array.from(new Set(assets.map((asset) => asset.assetId).filter(Boolean))),
    type: "market",
    custom_feature_enabled: true,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizedIsoFromEpochMillis(raw: unknown, fallback: string): string {
  const text = asString(raw);
  const numeric = text ? Number(text) : typeof raw === "number" ? raw : NaN;
  if (Number.isFinite(numeric)) {
    const ms = numeric < 1e12 ? numeric * 1000 : numeric;
    return new Date(ms).toISOString();
  }
  if (text) {
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return fallback;
}

function boundedProbability(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, Number(value.toFixed(6))));
}

function yesPriceForAsset(asset: PolymarketMarketStreamAsset, assetPrice: number | null): number | null {
  if (assetPrice == null) return null;
  if (asset.outcome === "YES") return assetPrice;
  return boundedProbability(1 - assetPrice);
}

function midpointFromBestBidAsk(raw: Record<string, unknown>): number | null {
  const bid = asNumber(raw.best_bid);
  const ask = asNumber(raw.best_ask);
  if (bid == null || ask == null) return null;
  return boundedProbability((bid + ask) / 2);
}

function midpointFromBook(raw: Record<string, unknown>): number | null {
  const bids = Array.isArray(raw.bids) ? raw.bids : [];
  const asks = Array.isArray(raw.asks) ? raw.asks : [];
  const bestBid = Math.max(
    ...bids
      .map((row) => row && typeof row === "object" ? asNumber((row as { price?: unknown }).price) : undefined)
      .filter((value): value is number => value != null),
  );
  const bestAsk = Math.min(
    ...asks
      .map((row) => row && typeof row === "object" ? asNumber((row as { price?: unknown }).price) : undefined)
      .filter((value): value is number => value != null),
  );
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return null;
  return boundedProbability((bestBid + bestAsk) / 2);
}

function priceForStreamEvent(raw: Record<string, unknown>): number | null {
  const eventType = raw.event_type;
  if (eventType === "best_bid_ask") return midpointFromBestBidAsk(raw);
  if (eventType === "book") return midpointFromBook(raw);
  if (eventType === "last_trade_price") return boundedProbability(asNumber(raw.price));
  if (eventType === "price_change") {
    return boundedProbability(
      asNumber(raw.price) ??
      asNumber(raw.best_bid) ??
      asNumber(raw.best_ask),
    );
  }
  return null;
}

function isMarketStreamEventType(value: unknown): value is PolymarketMarketStreamEventType {
  return (
    value === "book" ||
    value === "price_change" ||
    value === "tick_size_change" ||
    value === "last_trade_price" ||
    value === "best_bid_ask" ||
    value === "new_market" ||
    value === "market_resolved"
  );
}

export function normalizePolymarketMarketStreamMessage(
  raw: unknown,
  assets: PolymarketMarketStreamAsset[],
  opts: {
    sequence?: number;
    observedAt?: string;
  } = {},
): PolymarketMarketStreamNormalizedMessage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;
  const eventType = payload.event_type;
  if (!isMarketStreamEventType(eventType)) return null;
  const assetId = asString(payload.asset_id);
  if (!assetId) return null;
  const asset = assets.find((candidate) => candidate.assetId === assetId);
  if (!asset) return null;

  const observedAt = opts.observedAt ?? new Date().toISOString();
  const rawTimestamp = asString(payload.timestamp) ?? observedAt;
  const messageTimestamp = normalizedIsoFromEpochMillis(payload.timestamp, observedAt);
  const sequence = opts.sequence ?? 1;
  const hash = asString(payload.hash);
  const cursor = `${rawTimestamp}:${assetId}:${eventType}:${hash ?? sequence}`;
  const checkpoint: PolymarketMarketStreamCheckpoint = {
    sourceId: "polymarket-public",
    channel: "market",
    marketId: asset.marketId,
    ...(asset.conditionId ? { conditionId: asset.conditionId } : {}),
    assetId,
    outcome: asset.outcome,
    eventType,
    observedAt,
    messageTimestamp,
    sequence,
    ...(hash ? { hash } : {}),
    cursor: { after: cursor },
  };

  const assetPrice = priceForStreamEvent(payload);
  const priceYes = yesPriceForAsset(asset, assetPrice);
  const priceRecord = priceYes == null
    ? undefined
    : {
        marketId: asset.marketId,
        ts: messageTimestamp,
        priceYes,
        priceNo: boundedProbability(1 - priceYes),
        source: "polymarket-public" as const,
      };

  return {
    checkpoint,
    ...(priceRecord ? { priceRecord } : {}),
    ...(asNumber(payload.spread) != null ? { spread: asNumber(payload.spread) } : {}),
    ...(asNumber(payload.size) != null ? { size: asNumber(payload.size) } : {}),
    raw: payload,
  };
}

export function createPolymarketMarketStreamConsumer(opts: {
  assets: PolymarketMarketStreamAsset[];
  send: (payload: string) => void;
  onMessage?: (message: PolymarketMarketStreamNormalizedMessage) => void;
  now?: () => string;
}): PolymarketMarketStreamConsumer {
  let assets = [...opts.assets];
  let sequence = 0;
  const now = opts.now ?? (() => new Date().toISOString());
  const sendJson = (payload: unknown) => opts.send(JSON.stringify(payload));

  return {
    open() {
      sendJson(buildPolymarketMarketSubscription(assets));
    },
    heartbeat() {
      opts.send("PING");
    },
    receive(payload: string | Record<string, unknown>) {
      if (typeof payload === "string" && (payload === "PONG" || payload === "ping")) {
        if (payload === "ping") opts.send("pong");
        return null;
      }
      const parsed = typeof payload === "string" ? JSON.parse(payload) as unknown : payload;
      const message = normalizePolymarketMarketStreamMessage(parsed, assets, {
        sequence: ++sequence,
        observedAt: now(),
      });
      if (message) opts.onMessage?.(message);
      return message;
    },
    subscribe(nextAssets: PolymarketMarketStreamAsset[]) {
      const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
      for (const asset of nextAssets) byId.set(asset.assetId, asset);
      assets = [...byId.values()];
      sendJson({
        assets_ids: nextAssets.map((asset) => asset.assetId),
        operation: "subscribe",
        custom_feature_enabled: true,
      });
    },
    unsubscribe(assetIds: string[]) {
      const remove = new Set(assetIds);
      assets = assets.filter((asset) => !remove.has(asset.assetId));
      sendJson({
        assets_ids: assetIds,
        operation: "unsubscribe",
      });
    },
  };
}
