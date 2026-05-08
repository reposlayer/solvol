import type {
  NormalizedPolymarketMarket,
  PolymarketOrderBook,
  PolymarketTrade,
} from "./types.ts";

const NOW = "2026-05-07T12:00:00.000Z";

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function book(mid: number, depth: number): PolymarketOrderBook {
  const yesBid = Math.max(0.01, mid - 0.01);
  const yesAsk = Math.min(0.99, mid + 0.01);
  const noMid = 1 - mid;
  return {
    yesBids: [
      { price: round(yesBid, 2), size: depth },
      { price: round(yesBid - 0.02, 2), size: Math.round(depth * 1.25) },
      { price: round(yesBid - 0.04, 2), size: Math.round(depth * 1.8) },
    ],
    yesAsks: [
      { price: round(yesAsk, 2), size: Math.round(depth * 0.9) },
      { price: round(yesAsk + 0.02, 2), size: Math.round(depth * 1.35) },
      { price: round(yesAsk + 0.04, 2), size: Math.round(depth * 1.7) },
    ],
    noBids: [
      { price: round(noMid - 0.01, 2), size: Math.round(depth * 0.95) },
      { price: round(noMid - 0.03, 2), size: Math.round(depth * 1.3) },
      { price: round(noMid - 0.05, 2), size: Math.round(depth * 1.65) },
    ],
    noAsks: [
      { price: round(noMid + 0.01, 2), size: Math.round(depth * 0.85) },
      { price: round(noMid + 0.03, 2), size: Math.round(depth * 1.2) },
      { price: round(noMid + 0.05, 2), size: Math.round(depth * 1.55) },
    ],
  };
}

function trades(marketId: string, yesPrice: number, sizeBase: number): PolymarketTrade[] {
  return Array.from({ length: 6 }, (_, index) => {
    const side = index % 3 === 0 ? "SELL" : "BUY";
    const outcome = index % 2 === 0 ? "YES" : "NO";
    const price = outcome === "YES" ? yesPrice + (index - 2) * 0.004 : 1 - yesPrice + (2 - index) * 0.003;
    const size = sizeBase + index * 410;
    return {
      id: `${marketId}-trade-${index + 1}`,
      marketId,
      outcome,
      side,
      price: round(Math.max(0.01, Math.min(0.99, price)), 3),
      size,
      notional: round(size * Math.max(0.01, Math.min(0.99, price)), 2),
      timestamp: new Date(Date.parse(NOW) - index * 8 * 60_000).toISOString(),
      wallet: `0x${(948372 + index * 671).toString(16)}...${(8311 + index * 37).toString(16)}`,
    };
  });
}

export const MOCK_POLYMARKET_MARKETS: NormalizedPolymarketMarket[] = [
  {
    id: "540816",
    slug: "fed-rate-cut-june-2026",
    title: "Fed target rate cut by June meeting?",
    category: "Macro",
    yesPrice: 0.62,
    noPrice: 0.38,
    volume24h: 12845000,
    liquidity: 4210000,
    change24h: 0.047,
    endDate: "2026-06-17T18:00:00.000Z",
    sparkline: [0.54, 0.55, 0.57, 0.56, 0.59, 0.61, 0.62],
    orderBook: book(0.62, 18200),
    trades: trades("540816", 0.62, 8200),
    description:
      "Resolves to YES if the Federal Reserve announces at least one target-rate cut on or before the June 2026 FOMC decision.",
    resolutionSource: "Federal Reserve official statement and target range publication.",
    status: "open",
    updatedAt: NOW,
  },
  {
    id: "540817",
    slug: "bitcoin-100k-before-july",
    title: "Bitcoin above 100,000 before July?",
    category: "Crypto",
    yesPrice: 0.48,
    noPrice: 0.52,
    volume24h: 18320000,
    liquidity: 5100000,
    change24h: -0.031,
    endDate: "2026-06-30T23:59:00.000Z",
    sparkline: [0.53, 0.51, 0.49, 0.5, 0.47, 0.48, 0.48],
    orderBook: book(0.48, 24500),
    trades: trades("540817", 0.48, 11600),
    description: "Tracks whether a major USD bitcoin index records a print above the stated threshold before the deadline.",
    resolutionSource: "Primary exchange index and Polymarket resolution rules.",
    status: "open",
    updatedAt: NOW,
  },
  {
    id: "540818",
    slug: "us-election-turnout-record",
    title: "US general election turnout sets record?",
    category: "Politics",
    yesPrice: 0.35,
    noPrice: 0.65,
    volume24h: 7310000,
    liquidity: 2840000,
    change24h: 0.012,
    endDate: "2026-11-04T05:00:00.000Z",
    sparkline: [0.32, 0.33, 0.34, 0.33, 0.35, 0.36, 0.35],
    orderBook: book(0.35, 9700),
    trades: trades("540818", 0.35, 4200),
    description: "Resolves by certified national turnout compared with the prior high-water mark.",
    resolutionSource: "Certified state election results and national turnout aggregation.",
    status: "open",
    updatedAt: NOW,
  },
  {
    id: "540819",
    slug: "nvidia-largest-market-cap-may",
    title: "Nvidia largest public company at month end?",
    category: "Equities",
    yesPrice: 0.57,
    noPrice: 0.43,
    volume24h: 9350000,
    liquidity: 3660000,
    change24h: 0.021,
    endDate: "2026-05-29T20:00:00.000Z",
    sparkline: [0.51, 0.53, 0.52, 0.55, 0.56, 0.58, 0.57],
    orderBook: book(0.57, 14100),
    trades: trades("540819", 0.57, 7600),
    description: "Ranks public companies by market capitalization at the close of the final trading session in May.",
    resolutionSource: "Closing market capitalization data from public exchange feeds.",
    status: "open",
    updatedAt: NOW,
  },
  {
    id: "540820",
    slug: "champions-league-final-extra-time",
    title: "Champions League final goes to extra time?",
    category: "Sports",
    yesPrice: 0.29,
    noPrice: 0.71,
    volume24h: 4120000,
    liquidity: 1780000,
    change24h: -0.018,
    endDate: "2026-05-30T21:55:00.000Z",
    sparkline: [0.34, 0.32, 0.31, 0.3, 0.29, 0.28, 0.29],
    orderBook: book(0.29, 8600),
    trades: trades("540820", 0.29, 3100),
    description: "Resolves YES if regulation ends level and the match proceeds into extra time.",
    resolutionSource: "Official UEFA match report.",
    status: "open",
    updatedAt: NOW,
  },
  {
    id: "540821",
    slug: "ai-lab-frontier-model-release",
    title: "Major AI lab releases new frontier model this quarter?",
    category: "Technology",
    yesPrice: 0.66,
    noPrice: 0.34,
    volume24h: 10460000,
    liquidity: 3920000,
    change24h: 0.064,
    endDate: "2026-06-30T23:59:00.000Z",
    sparkline: [0.55, 0.57, 0.58, 0.61, 0.64, 0.65, 0.66],
    orderBook: book(0.66, 15700),
    trades: trades("540821", 0.66, 9400),
    description: "Resolves YES if a leading AI developer publicly releases a new frontier-class model by quarter end.",
    resolutionSource: "Official company announcement and release documentation.",
    status: "open",
    updatedAt: NOW,
  },
  {
    id: "540822",
    slug: "oil-above-90-before-summer",
    title: "Brent crude above 90 before summer?",
    category: "Commodities",
    yesPrice: 0.41,
    noPrice: 0.59,
    volume24h: 6180000,
    liquidity: 2390000,
    change24h: -0.006,
    endDate: "2026-06-20T21:00:00.000Z",
    sparkline: [0.43, 0.42, 0.44, 0.42, 0.41, 0.4, 0.41],
    orderBook: book(0.41, 7800),
    trades: trades("540822", 0.41, 5100),
    description: "Tracks whether front-month Brent crude records a qualifying print above the threshold before the deadline.",
    resolutionSource: "Recognized commodities price feed and exchange settlement data.",
    status: "open",
    updatedAt: NOW,
  },
  {
    id: "540823",
    slug: "supreme-court-major-decision-before-july",
    title: "Supreme Court issues major platform ruling before July?",
    category: "Legal",
    yesPrice: 0.52,
    noPrice: 0.48,
    volume24h: 5620000,
    liquidity: 2140000,
    change24h: 0.009,
    endDate: "2026-06-30T23:59:00.000Z",
    sparkline: [0.49, 0.5, 0.51, 0.5, 0.52, 0.53, 0.52],
    orderBook: book(0.52, 6900),
    trades: trades("540823", 0.52, 3700),
    description: "Resolves according to whether the court publishes a qualifying decision before the deadline.",
    resolutionSource: "Supreme Court opinions and official docket publications.",
    status: "open",
    updatedAt: NOW,
  },
];

export function findMockMarket(id: string | null | undefined): NormalizedPolymarketMarket {
  return MOCK_POLYMARKET_MARKETS.find((market) => market.id === id) ?? MOCK_POLYMARKET_MARKETS[0]!;
}

export function searchMockMarkets(query: string): NormalizedPolymarketMarket[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return MOCK_POLYMARKET_MARKETS;
  return MOCK_POLYMARKET_MARKETS.filter((market) =>
    [market.title, market.category, market.slug].some((value) => value.toLowerCase().includes(needle)),
  );
}
