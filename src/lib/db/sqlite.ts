import fs from "fs";
import path from "path";
import SqliteDatabase from "better-sqlite3";

let dbInstance: InstanceType<typeof SqliteDatabase> | null = null;

export function getSqlite(): InstanceType<typeof SqliteDatabase> | null {
  if (process.env.SQLITE_DISABLED === "true") return null;
  if (dbInstance) return dbInstance;
  try {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const fp = process.env.SQLITE_PATH || path.join(dir, "solvol.db");
    dbInstance = new SqliteDatabase(fp);
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS market_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        yes_mid REAL,
        volume24hr REAL,
        liquidity REAL,
        question TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_snap_ts ON market_snapshots(ts);
      CREATE INDEX IF NOT EXISTS idx_snap_market_ts ON market_snapshots(market_id, ts);
    `);
    return dbInstance;
  } catch {
    return null;
  }
}

export type SnapshotInsert = {
  marketId: string;
  ts: number;
  yesMid: number | null;
  volume24hr: number;
  liquidity: number;
  question: string;
};

export function insertSnapshot(row: SnapshotInsert): void {
  const db = getSqlite();
  if (!db) return;
  db.prepare(
    `INSERT INTO market_snapshots (market_id, ts, yes_mid, volume24hr, liquidity, question)
     VALUES (@marketId, @ts, @yesMid, @volume24hr, @liquidity, @question)`,
  ).run({
    marketId: row.marketId,
    ts: row.ts,
    yesMid: row.yesMid,
    volume24hr: row.volume24hr,
    liquidity: row.liquidity,
    question: row.question,
  });
}

export type FeedMove = {
  marketId: string;
  question: string | null;
  ts: number;
  yesMid: number | null;
  deltaYesMid: number | null;
  deltaVolume24h: number | null;
};

/** Latest snapshot per market vs previous snapshot for that market. */
export function getRecentFeedMoves(limit: number): FeedMove[] {
  const db = getSqlite();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT market_id AS marketId, ts, yes_mid AS yesMid, volume24hr, liquidity, question
       FROM market_snapshots ORDER BY ts DESC LIMIT 600`,
    )
    .all() as Array<{
      marketId: string;
      ts: number;
      yesMid: number | null;
      volume24hr: number;
      liquidity: number;
      question: string | null;
    }>;

  const byMarket = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byMarket.get(r.marketId) ?? [];
    arr.push(r);
    byMarket.set(r.marketId, arr);
  }

  const moves: FeedMove[] = [];
  for (const [, arr] of byMarket) {
    arr.sort((a, b) => b.ts - a.ts);
    if (arr.length < 2) continue;
    const cur = arr[0]!;
    const prev = arr[1]!;
    const deltaYes =
      cur.yesMid != null && prev.yesMid != null ? cur.yesMid - prev.yesMid : null;
    const deltaVol = cur.volume24hr - prev.volume24hr;
    moves.push({
      marketId: cur.marketId,
      question: cur.question,
      ts: cur.ts,
      yesMid: cur.yesMid,
      deltaYesMid: deltaYes,
      deltaVolume24h: deltaVol,
    });
  }

  moves.sort((a, b) => {
    const ax = Math.abs(a.deltaYesMid ?? 0) + Math.abs(a.deltaVolume24h ?? 0) * 1e-6;
    const bx = Math.abs(b.deltaYesMid ?? 0) + Math.abs(b.deltaVolume24h ?? 0) * 1e-6;
    return bx - ax;
  });

  return moves.slice(0, limit);
}
