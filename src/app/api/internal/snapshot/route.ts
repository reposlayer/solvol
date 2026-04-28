import { runSnapshotJob } from "@/lib/polymarket/snapshot-job";
import { getSqlite } from "@/lib/db/sqlite";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!getSqlite()) {
    return Response.json(
      { error: "SQLite disabled or unavailable (set SQLITE_DISABLED=false and run on Node)" },
      { status: 503 },
    );
  }

  const secret = process.env.SNAPSHOT_CRON_SECRET;
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-cron-secret");
  if (!secret || token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const topN = Number.parseInt(url.searchParams.get("top") ?? "28", 10);
  const result = await runSnapshotJob(Number.isFinite(topN) ? topN : 28);
  return Response.json({ ok: true, ...result });
}
