import type {
  AlertEvent,
  AlertRule,
  EventItem,
  Market,
  MarketMove,
  MarketSource,
  MarketSourceMarketQuery,
  MarketSourceStatus,
  TerminalDataSourceRef,
  WalletActivity,
} from "./types";

type MockSourceOptions = {
  now?: string;
};

const DEMO_SOURCE: TerminalDataSourceRef = {
  id: "demo",
  label: "Solvol Demo Source",
  kind: "mock",
  url: null,
};

const DEMO_NEWS_SOURCE: TerminalDataSourceRef = {
  id: "demo-news",
  label: "Demo news source",
  kind: "mock",
  url: null,
};

const DEMO_SYSTEM_SOURCE: TerminalDataSourceRef = {
  id: "demo-system",
  label: "Demo Solvol system",
  kind: "mock",
  url: null,
};

function isoFrom(baseMs: number, minutesOffset: number): string {
  return new Date(baseMs + minutesOffset * 60 * 1000).toISOString();
}

function history(baseMs: number, startProbability: number, deltas: number[]): Market["priceHistory"] {
  let current = startProbability;
  return deltas.map((delta, index) => {
    current = Math.max(0.01, Math.min(0.99, current + delta));
    return {
      timestamp: isoFrom(baseMs, -((deltas.length - index) * 30)),
      probability: Number(current.toFixed(4)),
      volumeUsd: 25_000 + index * 8_200 + Math.abs(delta) * 900_000,
    };
  });
}

function market(input: {
  id: string;
  title: string;
  category: string;
  event: string;
  probability: number;
  volume24h: number;
  volume7d: number;
  liquidity: number;
  openInterest: number;
  closeOffsetHours: number;
  createdOffsetDays: number;
  deltas: number[];
  baseMs: number;
}): Market {
  const priceHistory = history(input.baseMs, input.probability - input.deltas.reduce((a, b) => a + b, 0), input.deltas);
  const probability = priceHistory.at(-1)?.probability ?? input.probability;
  return {
    id: input.id,
    source: DEMO_SOURCE,
    title: input.title,
    category: input.category,
    event: input.event,
    url: null,
    description: "Demo market used when live Polymarket data is unavailable. Figures are deterministic mock data.",
    resolutionRules: "Demo resolution text. Replace with source-provided rules from the market adapter.",
    outcomes: [
      { id: `${input.id}-yes`, label: "YES", probability, price: probability },
      { id: `${input.id}-no`, label: "NO", probability: 1 - probability, price: 1 - probability },
    ],
    probability,
    volume24h: input.volume24h,
    volume7d: input.volume7d,
    liquidity: input.liquidity,
    openInterest: input.openInterest,
    closeTime: isoFrom(input.baseMs, input.closeOffsetHours * 60),
    createdAt: isoFrom(input.baseMs, -input.createdOffsetDays * 24 * 60),
    updatedAt: isoFrom(input.baseMs, 0),
    status: "open",
    priceHistory,
  };
}

function buildMarkets(baseMs: number): Market[] {
  return [
    market({
      id: "900001",
      title: "Will the next FOMC statement explicitly mention renewed inflation risk?",
      category: "Macro",
      event: "Federal Reserve",
      probability: 0.64,
      volume24h: 1_240_000,
      volume7d: 2_900_000,
      liquidity: 2_450_000,
      openInterest: 3_100_000,
      closeOffsetHours: 312,
      createdOffsetDays: 28,
      deltas: [0.01, 0.02, 0.04, 0.08, -0.01, 0.03],
      baseMs,
    }),
    market({
      id: "900002",
      title: "Will a spot Ethereum ETF see over $5B net inflows before month end?",
      category: "Crypto",
      event: "ETF Flows",
      probability: 0.57,
      volume24h: 890_000,
      volume7d: 1_700_000,
      liquidity: 1_180_000,
      openInterest: 1_920_000,
      closeOffsetHours: 196,
      createdOffsetDays: 19,
      deltas: [-0.01, 0.03, 0.05, 0.02, 0.03, 0.01],
      baseMs,
    }),
    market({
      id: "900003",
      title: "Will the leading candidate win the national election by more than 5 points?",
      category: "Politics",
      event: "Election polling",
      probability: 0.49,
      volume24h: 2_820_000,
      volume7d: 8_200_000,
      liquidity: 4_900_000,
      openInterest: 7_300_000,
      closeOffsetHours: 1150,
      createdOffsetDays: 44,
      deltas: [0.02, -0.04, -0.06, 0.01, -0.03, -0.02],
      baseMs,
    }),
    market({
      id: "900004",
      title: "Will a major AI lab announce a frontier model before Friday?",
      category: "Technology",
      event: "AI releases",
      probability: 0.71,
      volume24h: 540_000,
      volume7d: 790_000,
      liquidity: 720_000,
      openInterest: 1_080_000,
      closeOffsetHours: 72,
      createdOffsetDays: 8,
      deltas: [0.01, 0.01, 0.05, 0.07, 0.03, 0.02],
      baseMs,
    }),
    market({
      id: "900005",
      title: "Will Bitcoin close the week above $100,000?",
      category: "Crypto",
      event: "Bitcoin weekly close",
      probability: 0.43,
      volume24h: 1_600_000,
      volume7d: 5_900_000,
      liquidity: 2_050_000,
      openInterest: 3_800_000,
      closeOffsetHours: 91,
      createdOffsetDays: 12,
      deltas: [0.0, -0.01, -0.02, 0.03, -0.06, 0.01],
      baseMs,
    }),
    market({
      id: "900006",
      title: "Will the championship final go to overtime?",
      category: "Sports",
      event: "Championship final",
      probability: 0.24,
      volume24h: 210_000,
      volume7d: 380_000,
      liquidity: 410_000,
      openInterest: 620_000,
      closeOffsetHours: 36,
      createdOffsetDays: 5,
      deltas: [0.01, -0.005, 0.015, 0.0, 0.01, 0.005],
      baseMs,
    }),
  ];
}

function buildMoves(markets: Market[]): MarketMove[] {
  return markets.map((market) => {
    const before = market.priceHistory.at(-2) ?? market.priceHistory[0]!;
    const after = market.priceHistory.at(-1) ?? before;
    return {
      id: `move-${market.id}`,
      marketId: market.id,
      timestamp: after.timestamp,
      windowMinutes: 30,
      probabilityBefore: before.probability,
      probabilityAfter: after.probability,
      volumeUsd: Math.max(40_000, after.volumeUsd ?? market.volume24h / 8),
      source: "demo",
    };
  });
}

function buildWallets(baseMs: number, markets: Market[]): WalletActivity[] {
  const rows: WalletActivity[] = [
    {
      id: "wallet-demo-1",
      marketId: markets[0]!.id,
      walletAddress: "0x6a93e8c25f0b8d64ad7e97d40f319cb5a8f1a001",
      label: "Demo macro whale",
      outcome: "YES",
      side: "BUY",
      size: 44_200,
      notionalUsd: 318_000,
      price: 0.64,
      timestamp: isoFrom(baseMs, -22),
      source: "demo",
    },
    {
      id: "wallet-demo-2",
      marketId: markets[2]!.id,
      walletAddress: "0x9e4470a463d2f0b2782a5b5bda79f8d03a4f2002",
      label: "Demo poll desk",
      outcome: "NO",
      side: "BUY",
      size: 61_000,
      notionalUsd: 427_000,
      price: 0.51,
      timestamp: isoFrom(baseMs, -36),
      source: "demo",
    },
    {
      id: "wallet-demo-3",
      marketId: markets[3]!.id,
      walletAddress: "0x188f2046d8698f8bb44b86ffed2fba44dff40003",
      label: "Demo tech flow",
      outcome: "YES",
      side: "BUY",
      size: 18_400,
      notionalUsd: 132_000,
      price: 0.71,
      timestamp: isoFrom(baseMs, -12),
      source: "demo",
    },
    {
      id: "wallet-demo-4",
      marketId: markets[4]!.id,
      walletAddress: "0x344bf8cefdedc1c2ddfdb21e36f217c90a100004",
      label: null,
      outcome: "NO",
      side: "SELL",
      size: 12_500,
      notionalUsd: 58_000,
      price: 0.57,
      timestamp: isoFrom(baseMs, -68),
      source: "demo",
    },
  ];
  return rows;
}

function buildEvents(baseMs: number, markets: Market[]): EventItem[] {
  return [
    {
      id: "event-demo-1",
      marketId: markets[0]!.id,
      timestamp: isoFrom(baseMs, -18),
      kind: "news",
      title: "Demo: central-bank preview flags sticky services inflation",
      summary: "Demo/mock source item for local correlation testing. Not a real news claim.",
      source: DEMO_NEWS_SOURCE,
      impact: "up",
      importance: 76,
    },
    {
      id: "event-demo-2",
      marketId: markets[2]!.id,
      timestamp: isoFrom(baseMs, -34),
      kind: "news",
      title: "Demo: polling memo narrows projected margin",
      summary: "Demo/mock source item for local fallback. Not a real news claim.",
      source: DEMO_NEWS_SOURCE,
      impact: "down",
      importance: 82,
    },
    {
      id: "event-demo-3",
      marketId: markets[3]!.id,
      timestamp: isoFrom(baseMs, -10),
      kind: "system",
      title: "Demo volatility spike detected",
      summary: "Solvol mock engine detected a local probability acceleration.",
      source: DEMO_SYSTEM_SOURCE,
      impact: "up",
      importance: 68,
    },
    {
      id: "event-demo-4",
      marketId: null,
      timestamp: isoFrom(baseMs, -50),
      kind: "system",
      title: "Demo data source fallback active",
      summary: "Mock data is being used where live API data is unavailable.",
      source: DEMO_SYSTEM_SOURCE,
      impact: "neutral",
      importance: 55,
    },
  ];
}

function buildAlertRules(baseMs: number, markets: Market[]): AlertRule[] {
  return [
    {
      id: "rule-demo-1",
      marketId: markets[0]!.id,
      name: "YES crosses 70%",
      kind: "probability_cross",
      threshold: 0.7,
      windowMinutes: null,
      enabled: true,
      createdAt: isoFrom(baseMs, -1440),
    },
    {
      id: "rule-demo-2",
      marketId: null,
      name: "Whale trade over $100k",
      kind: "whale_activity",
      threshold: 100_000,
      windowMinutes: 15,
      enabled: true,
      createdAt: isoFrom(baseMs, -1320),
    },
    {
      id: "rule-demo-3",
      marketId: null,
      name: "Probability jump over 8c in 30m",
      kind: "probability_jump",
      threshold: 0.08,
      windowMinutes: 30,
      enabled: true,
      createdAt: isoFrom(baseMs, -1260),
    },
  ];
}

function buildAlertEvents(baseMs: number, markets: Market[]): AlertEvent[] {
  return [
    {
      id: "alert-demo-1",
      ruleId: "rule-demo-2",
      marketId: markets[0]!.id,
      title: "Demo whale flow over threshold",
      body: "Demo macro whale bought YES for roughly $318k notional.",
      severity: "critical",
      timestamp: isoFrom(baseMs, -22),
      read: false,
    },
    {
      id: "alert-demo-2",
      ruleId: "rule-demo-3",
      marketId: markets[3]!.id,
      title: "Demo probability acceleration",
      body: "AI release market moved more than 8c inside the 30 minute scanner window.",
      severity: "warning",
      timestamp: isoFrom(baseMs, -10),
      read: false,
    },
  ];
}

function filterMarkets(markets: Market[], query?: MarketSourceMarketQuery): Market[] {
  const search = query?.search?.trim().toLowerCase();
  const category = query?.category?.trim().toLowerCase();
  let rows = markets;
  if (search) {
    rows = rows.filter((market) =>
      `${market.title} ${market.category} ${market.event}`.toLowerCase().includes(search),
    );
  }
  if (category) {
    rows = rows.filter((market) => market.category.toLowerCase() === category);
  }
  if (query?.moversOnly) {
    rows = rows.filter((market) => {
      const first = market.priceHistory[0]?.probability;
      const last = market.priceHistory.at(-1)?.probability;
      return first != null && last != null && Math.abs(last - first) >= 0.05;
    });
  }
  return rows.slice(0, Math.max(1, Math.min(query?.limit ?? rows.length, 80)));
}

export function createMockMarketSource(options: MockSourceOptions = {}): MarketSource {
  const baseMs = Date.parse(options.now ?? new Date().toISOString());
  const checkedAt = new Date(baseMs).toISOString();
  const markets = buildMarkets(baseMs);
  const moves = buildMoves(markets);
  const wallets = buildWallets(baseMs, markets);
  const events = buildEvents(baseMs, markets);
  const alertRules = buildAlertRules(baseMs, markets);
  const alertEvents = buildAlertEvents(baseMs, markets);

  return {
    id: "demo",
    label: "Solvol Demo Source",
    mode: "mock",
    readOnly: true,
    async listMarkets(query) {
      return filterMarkets(markets, query);
    },
    async getMarket(marketId) {
      return markets.find((market) => market.id === marketId) ?? null;
    },
    async listMoves(marketId) {
      return marketId ? moves.filter((move) => move.marketId === marketId) : moves;
    },
    async listWalletActivity(query) {
      let rows = wallets;
      if (query?.marketId) rows = rows.filter((activity) => activity.marketId === query.marketId);
      if (query?.walletAddress) {
        rows = rows.filter((activity) => activity.walletAddress.toLowerCase() === query.walletAddress!.toLowerCase());
      }
      return rows.slice(0, Math.max(1, Math.min(query?.limit ?? rows.length, 80)));
    },
    async listEvents(query) {
      let rows = events;
      if (query?.marketId) {
        rows = rows.filter((item) => item.marketId === query.marketId || item.marketId === null);
      }
      return rows.slice(0, Math.max(1, Math.min(query?.limit ?? rows.length, 80)));
    },
    async listAlertRules() {
      return alertRules;
    },
    async listAlertEvents() {
      return alertEvents;
    },
    async status(): Promise<MarketSourceStatus> {
      return {
        id: "demo",
        label: "Solvol Demo Source",
        mode: "mock",
        readOnly: true,
        healthy: true,
        latencyMs: 0,
        checkedAt,
        message: "Deterministic local demo data is ready.",
      };
    },
  };
}
