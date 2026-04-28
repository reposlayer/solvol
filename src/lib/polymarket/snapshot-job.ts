import { fetchDiscoveryLane } from "./discovery";
import { fetchGammaMarket, fetchMidpoint, getYesTokenFromMarket } from "./client";
import { insertSnapshot } from "@/lib/db/sqlite";

/** Upsert snapshots for top hot markets (Node runtime only). */
export async function runSnapshotJob(topN: number): Promise<{ inserted: number }> {
  const rows = await fetchDiscoveryLane("hot", { limit: Math.min(topN, 40) });
  const ts = Date.now();
  let inserted = 0;

  for (const r of rows) {
    try {
      const m = await fetchGammaMarket(r.id);
      const yes = getYesTokenFromMarket(m);
      const mid = yes ? await fetchMidpoint(yes) : null;
      insertSnapshot({
        marketId: r.id,
        ts,
        yesMid: mid,
        volume24hr: r.volume24hr,
        liquidity: r.liquidityNum,
        question: r.question,
      });
      inserted += 1;
    } catch {
      /* skip market */
    }
  }

  return { inserted };
}
