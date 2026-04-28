import type { GammaMarket } from "./types";
import { fetchYesShortMomentumPct } from "./clob-momentum";
import { baseTerminalHotScore, terminalScoreWithMomentum } from "./hot-score";
import { yesTokenId } from "./tokens";

const GAMMA = "https://gamma-api.polymarket.com";

export type DiscoveryLane =
  | "high_volume"
  | "closing_soon"
  | "new"
  | "hot"
  | "research_worthy"
  | "deadline_risk"
  | "anomaly"
  | "catalyst_rich";

export type DiscoveryMarketRow = {
  id: string;
  question: string;
  slug?: string;
  yesPrice: number | null;
  volume24hr: number;
  volume1wk: number;
  liquidityNum: number;
  endDate: string | null;
  createdAt: string | null;
  featured: boolean;
  competitive: number;
  terminalScore?: number;
  hoursToClose?: number | null;
  volumeSpikeRatio?: number;
  /** Step move % on YES implied (CLOB coarse); hot lane when momentum batch runs. */
  shortMovePct?: number | null;
};

function parseYesPrice(outcomePrices: string | undefined): number | null {
  if (!outcomePrices) return null;
  try {
    const arr = JSON.parse(outcomePrices) as unknown;
    if (Array.isArray(arr) && arr.length > 0) {
      const n = Number(arr[0]);
      return Number.isFinite(n) ? n : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchMarketsQuery(params: Record<string, string | number | boolean>): Promise<GammaMarket[]> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    q.set(k, String(v));
  }
  const res = await fetch(`${GAMMA}/markets?${q.toString()}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Gamma markets: ${res.status}`);
  }
  return res.json() as Promise<GammaMarket[]>;
}

function toRow(m: GammaMarket, extras?: Partial<DiscoveryMarketRow>): DiscoveryMarketRow {
  const volume24hr = m.volume24hr ?? 0;
  const volume1wk = m.volume1wk ?? 0;
  const dailyAvg = volume1wk > 0 ? volume1wk / 7 : volume24hr;
  const volumeSpikeRatio = dailyAvg > 0 ? volume24hr / dailyAvg : 1;

  return {
    id: m.id,
    question: m.question,
    slug: m.slug,
    yesPrice: parseYesPrice(m.outcomePrices),
    volume24hr,
    volume1wk,
    liquidityNum: (() => {
      const n = m.liquidityNum ?? Number(m.liquidity ?? 0);
      return Number.isFinite(n) ? n : 0;
    })(),
    endDate: m.endDate ?? null,
    createdAt: m.createdAt ?? null,
    featured: Boolean(m.featured),
    competitive: typeof m.competitive === "number" ? m.competitive : 0,
    volumeSpikeRatio,
    ...extras,
  };
}

function withTag(
  params: Record<string, string | number | boolean>,
  tagId?: string,
): Record<string, string | number | boolean> {
  if (tagId && /^\d+$/.test(tagId)) {
    return { ...params, tag_id: tagId };
  }
  return params;
}

const HOT_MOMENTUM_DEPTH = 55;
const MOMENTUM_CONCURRENCY = 8;

async function momentumPctForTopVolume(
  markets: GammaMarket[],
): Promise<Map<string, number | null>> {
  const slice = markets.slice(0, HOT_MOMENTUM_DEPTH);
  const map = new Map<string, number | null>();
  for (let i = 0; i < slice.length; i += MOMENTUM_CONCURRENCY) {
    const chunk = slice.slice(i, i + MOMENTUM_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (m) => {
        const tok = yesTokenId(m.clobTokenIds);
        if (!tok) return { id: m.id, pct: null as number | null };
        try {
          const pct = await fetchYesShortMomentumPct(tok);
          return { id: m.id, pct };
        } catch {
          return { id: m.id, pct: null };
        }
      }),
    );
    for (const r of results) map.set(r.id, r.pct);
  }
  return map;
}

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / (1000 * 60 * 60);
}

export async function fetchDiscoveryLane(
  lane: DiscoveryLane,
  opts?: { limit?: number; closingWithinHours?: number; tagId?: string },
): Promise<DiscoveryMarketRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 80);
  const closingHours = opts?.closingWithinHours ?? 168;
  const tagId = opts?.tagId;

  switch (lane) {
    case "high_volume": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit,
            order: "volume24hr",
            ascending: false,
          },
          tagId,
        ),
      );
      return raw.map((m) => toRow(m));
    }
    case "new": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit,
            order: "createdAt",
            ascending: false,
          },
          tagId,
        ),
      );
      return raw.map((m) => toRow(m));
    }
    case "closing_soon": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit: 500,
            order: "end_date",
            ascending: true,
          },
          tagId,
        ),
      );
      const now = Date.now();
      const horizon = now + closingHours * 60 * 60 * 1000;
      let filtered = raw.filter((m) => {
        if (!m.endDate) return false;
        const t = Date.parse(m.endDate);
        return Number.isFinite(t) && t > now && t < horizon;
      });
      filtered.sort((a, b) => Date.parse(a.endDate ?? "") - Date.parse(b.endDate ?? ""));
      if (filtered.length < Math.min(8, limit)) {
        const future = raw
          .filter((m) => {
            if (!m.endDate) return false;
            const t = Date.parse(m.endDate);
            return Number.isFinite(t) && t > now;
          })
          .sort((a, b) => Date.parse(a.endDate ?? "") - Date.parse(b.endDate ?? ""));
        filtered = future.slice(0, Math.max(limit, 20));
      }
      return filtered.slice(0, limit).map((m) =>
        toRow(m, { hoursToClose: hoursUntil(m.endDate ?? null) }),
      );
    }
    case "hot": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit: 150,
            order: "volume24hr",
            ascending: false,
          },
          tagId,
        ),
      );
      const momentumMap = await momentumPctForTopVolume(raw);
      const scored = raw
        .map((m) => {
          const base = baseTerminalHotScore(m);
          const pct = momentumMap.get(m.id);
          return {
            m,
            score: terminalScoreWithMomentum(base, pct),
            shortMovePct: pct ?? null,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return scored.map(({ m, score, shortMovePct }) =>
        toRow(m, { terminalScore: score, shortMovePct }),
      );
    }
    case "research_worthy": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit: 180,
            order: "volume24hr",
            ascending: false,
          },
          tagId,
        ),
      );
      const scored = raw
        .map((m) => {
          const row = toRow(m);
          const close = hoursUntil(row.endDate);
          const sourceDensity = /\b(election|fed|cpi|bitcoin|ethereum|ai|openai|trump|court|war|rate|inflation|earnings|approval|poll)\b/i.test(row.question)
            ? 12
            : 0;
          const deadline = close != null && close > 0 && close < 168 ? Math.max(0, 168 - close) / 14 : 0;
          const score =
            Math.log10(1 + row.volume24hr) * 8 +
            Math.log10(1 + row.liquidityNum) * 3 +
            (row.volumeSpikeRatio ?? 1) * 10 +
            deadline +
            sourceDensity;
          return { row, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return scored.map(({ row, score }) => ({ ...row, terminalScore: score }));
    }
    case "deadline_risk": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit: 500,
            order: "end_date",
            ascending: true,
          },
          tagId,
        ),
      );
      const rows = raw
        .map((m) => toRow(m, { hoursToClose: hoursUntil(m.endDate ?? null) }))
        .filter((row) => row.hoursToClose != null && row.hoursToClose > 0 && row.hoursToClose < closingHours)
        .map((row) => {
          const hours = row.hoursToClose ?? closingHours;
          const score =
            Math.max(0, closingHours - hours) +
            Math.log10(1 + row.volume24hr) * 5 +
            Math.log10(1 + row.liquidityNum) * 2;
          return { ...row, terminalScore: score };
        })
        .sort((a, b) => (b.terminalScore ?? 0) - (a.terminalScore ?? 0));
      return rows.slice(0, limit);
    }
    case "anomaly": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit: 180,
            order: "volume24hr",
            ascending: false,
          },
          tagId,
        ),
      );
      return raw
        .map((m) => {
          const row = toRow(m);
          const score =
            Math.max(0, (row.volumeSpikeRatio ?? 1) - 1) * 35 +
            Math.log10(1 + row.volume24hr) * 7 +
            (row.featured ? 4 : 0);
          return { ...row, terminalScore: score };
        })
        .sort((a, b) => (b.terminalScore ?? 0) - (a.terminalScore ?? 0))
        .slice(0, limit);
    }
    case "catalyst_rich": {
      const raw = await fetchMarketsQuery(
        withTag(
          {
            closed: false,
            active: true,
            limit: 180,
            order: "volume24hr",
            ascending: false,
          },
          tagId,
        ),
      );
      return raw
        .map((m) => {
          const row = toRow(m);
          const q = row.question.toLowerCase();
          const evidenceWords = [
            "election",
            "poll",
            "court",
            "fed",
            "cpi",
            "inflation",
            "bitcoin",
            "ethereum",
            "openai",
            "nvidia",
            "tesla",
            "war",
            "ceasefire",
            "approval",
            "earnings",
            "launch",
          ].filter((word) => q.includes(word)).length;
          const score = evidenceWords * 16 + Math.log10(1 + row.volume24hr) * 8 + (row.volumeSpikeRatio ?? 1) * 4;
          return { ...row, terminalScore: score };
        })
        .filter((row) => (row.terminalScore ?? 0) > 18)
        .sort((a, b) => (b.terminalScore ?? 0) - (a.terminalScore ?? 0))
        .slice(0, limit);
    }
    default: {
      const _exhaustive: never = lane;
      return _exhaustive;
    }
  }
}

export function isDiscoveryLane(s: string | null): s is DiscoveryLane {
  return (
    s === "high_volume" ||
    s === "closing_soon" ||
    s === "new" ||
    s === "hot" ||
    s === "research_worthy" ||
    s === "deadline_risk" ||
    s === "anomaly" ||
    s === "catalyst_rich"
  );
}
