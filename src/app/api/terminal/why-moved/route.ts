import { createFedRssSourceAdapter } from "@/lib/terminal/source-adapters";
import {
  clusterNewsItems,
  dedupeNewsItems,
  explainWhyMoved,
} from "@/lib/terminal/source-intelligence";
import { fetchTerminalWhyMovedSnapshot } from "@/lib/terminal/serving";
import type { Market, MarketMove } from "@/lib/terminal/types";

export const runtime = "nodejs";

const FIXTURE_NOW = "2026-05-07T12:00:00.000Z";

function fixtureMarket(): Market {
  return {
    id: "fixture-fed-rate-cut",
    source: {
      id: "polymarket",
      label: "Polymarket",
      kind: "polymarket",
      url: "https://polymarket.com",
    },
    title: "Will the Federal Reserve approve a rate cut by June 2026?",
    category: "Macro",
    event: "Federal Reserve rate decision",
    url: "https://polymarket.com/event/fed-rate-cut-fixture",
    description: "Resolves Yes if the Federal Reserve approves a rate cut by the deadline.",
    resolutionRules: "Official Federal Reserve source.",
    outcomes: [
      { id: "fixture-fed-rate-cut-yes", label: "YES", probability: 0.62, price: 0.62 },
      { id: "fixture-fed-rate-cut-no", label: "NO", probability: 0.38, price: 0.38 },
    ],
    probability: 0.62,
    volume24h: 240_000,
    volume7d: 700_000,
    liquidity: 900_000,
    openInterest: null,
    closeTime: "2026-06-30T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: FIXTURE_NOW,
    status: "open",
    priceHistory: [
      { timestamp: "2026-05-07T11:35:00.000Z", probability: 0.49 },
      { timestamp: "2026-05-07T12:05:00.000Z", probability: 0.62 },
    ],
  };
}

async function fixtureEvents() {
  const adapter = createFedRssSourceAdapter([
    {
      id: "fed:release:2026-05-07",
      title: "Federal Reserve approves rate cut timeline",
      link: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260507a.htm",
      published: "2026-05-07T11:59:00.000Z",
      summary: "The Committee approved a path toward lowering rates.",
    },
  ], { now: FIXTURE_NOW });
  const batch = await adapter.fetchBatch();
  const newsItems = dedupeNewsItems((await Promise.all(batch.rawItems.map((item) => adapter.normalize(item)))).flat());
  return {
    newsItems,
    eventClusters: clusterNewsItems(newsItems, { now: FIXTURE_NOW }),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const durable = await fetchTerminalWhyMovedSnapshot({
    marketId: url.searchParams.get("marketId") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 25),
  });
  if (durable.mode === "durable" && durable.whyMovedCandidates.length > 0) {
    return Response.json(durable);
  }

  const market = fixtureMarket();
  const moves: MarketMove[] = [
    {
      id: "fixture-move-fed-rate-cut",
      marketId: market.id,
      timestamp: "2026-05-07T12:05:00.000Z",
      windowMinutes: 30,
      probabilityBefore: 0.49,
      probabilityAfter: 0.62,
      volumeUsd: 240_000,
      source: "polymarket",
    },
  ];
  const { newsItems, eventClusters } = await fixtureEvents();
  const whyMovedCandidates = explainWhyMoved({
    market,
    events: eventClusters,
    moves,
    createdAt: FIXTURE_NOW,
  });

  return Response.json({
    readOnly: true,
    fetchedAt: new Date().toISOString(),
    market,
    moves,
    newsItems,
    eventClusters,
    whyMovedCandidates,
  });
}
