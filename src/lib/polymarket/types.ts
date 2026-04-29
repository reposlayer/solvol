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
