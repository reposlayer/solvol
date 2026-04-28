import type { RelatedMarketSnapshot } from "@/lib/domain/types";
import type { PriceHistoryPoint } from "@/lib/polymarket/types";
import { parseClobTokenIds } from "@/lib/polymarket/tokens";
import { fetchYesPriceHistory } from "@/lib/polymarket/client";

const GAMMA = "https://gamma-api.polymarket.com";

type SearchEvent = {
  markets?: {
    id: string;
    question: string;
    outcomePrices?: string;
  }[];
};

type SearchResponse = {
  events?: SearchEvent[];
};

function parseFirstYesPrice(outcomePrices: string | undefined): number | null {
  if (!outcomePrices) return null;
  try {
    const arr = JSON.parse(outcomePrices) as unknown;
    if (Array.isArray(arr) && arr.length > 0) {
      const p = Number(arr[0]);
      return Number.isFinite(p) ? p : null;
    }
  } catch {
    return null;
  }
  return null;
}

function shortStepMovePercent(history: PriceHistoryPoint[]): number {
  if (history.length < 2) return 0;
  const a = history[history.length - 2]!;
  const b = history[history.length - 1]!;
  if (a.p <= 0) return 0;
  return ((b.p - a.p) / a.p) * 100;
}

export async function findRelatedMarkets(
  query: string,
  excludeMarketId: string,
  mainMoveSign: number,
  limit: number,
): Promise<RelatedMarketSnapshot[]> {
  const q = query.trim() || "politics";
  const res = await fetch(
    `${GAMMA}/public-search?q=${encodeURIComponent(q)}&limit=8&events_status=active`,
    { next: { revalidate: 120 } },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as SearchResponse;
  const events = data.events ?? [];
  const candidates: { id: string; title: string }[] = [];
  for (const ev of events) {
    for (const m of ev.markets ?? []) {
      if (m.id === excludeMarketId) continue;
      candidates.push({ id: m.id, title: m.question });
    }
  }

  const unique = candidates.filter(
    (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i,
  );
  const taken = unique.slice(0, limit);

  const snap: RelatedMarketSnapshot[] = [];

  for (const c of taken) {
    const mres = await fetch(`${GAMMA}/markets/${c.id}`, { next: { revalidate: 60 } });
    if (!mres.ok) continue;
    const m = (await mres.json()) as {
      clobTokenIds?: unknown;
      outcomePrices?: string;
    };
    const yes = parseClobTokenIds(m.clobTokenIds)[0];
    const nowYes = parseFirstYesPrice(m.outcomePrices) ?? 0;
    if (!yes) continue;

    const history = await fetchYesPriceHistory(yes);
    const movePct = shortStepMovePercent(history);
    const dirSign = movePct === 0 ? 0 : movePct > 0 ? 1 : -1;
    const directionAligned =
      mainMoveSign === 0 ? false : dirSign === 0 ? false : mainMoveSign === dirSign;

    snap.push({
      marketId: c.id,
      title: c.title,
      yesPrice: nowYes,
      movePercent: movePct,
      directionAligned,
      correlationScore: directionAligned ? 0.7 : 0.2,
    });
  }

  return snap;
}
