export type GammaEventSummary = {
  id: string | number;
  slug?: string;
  ticker?: string;
  title?: string;
  description?: string;
  category?: string;
  active?: boolean;
  closed?: boolean;
  volume?: number | string;
  volume24hr?: number;
  liquidity?: number | string;
  endDate?: string;
  createdAt?: string;
  markets?: GammaMarket[];
};

/** Subset of Gamma `/markets` JSON used by the catalyst engine. */
export type GammaMarket = {
  id: string;
  question: string;
  conditionId?: string;
  slug?: string;
  description?: string;
  category?: string;
  outcomes?: string;
  outcomePrices?: string;
  volume?: string;
  volumeNum?: number;
  volume24hr?: number;
  volume1wk?: number;
  liquidity?: string;
  liquidityNum?: number;
  clobTokenIds?: unknown;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  createdAt?: string;
  featured?: boolean;
  competitive?: number;
  eventId?: number;
  events?: GammaEventSummary[];
  icon?: string;
};

export type PriceHistoryPoint = {
  t: number;
  p: number;
};

export type PricesHistoryResponse = {
  history?: PriceHistoryPoint[];
  error?: string;
};

export type PolymarketOrderLevel = {
  price: number;
  size: number;
};

export type PolymarketOrderBook = {
  yesBids: PolymarketOrderLevel[];
  yesAsks: PolymarketOrderLevel[];
  noBids: PolymarketOrderLevel[];
  noAsks: PolymarketOrderLevel[];
};

export type PolymarketTrade = {
  id: string;
  marketId: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  price: number;
  size: number;
  notional: number;
  timestamp: string;
  wallet: string;
};

export type NormalizedPolymarketMarket = {
  id: string;
  slug: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  liquidity: number;
  change24h: number;
  endDate: string;
  sparkline: number[];
  orderBook: PolymarketOrderBook;
  trades: PolymarketTrade[];
  description: string;
  resolutionSource: string;
  status: "open" | "closed" | "resolved";
  updatedAt: string;
};
