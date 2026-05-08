import {
  buildIngestAuthResult,
  normalizeIngestLimit,
  runSourceIngest,
} from "@/lib/context/ingest";

export const runtime = "nodejs";

async function handleIngest(request: Request) {
  const auth = buildIngestAuthResult(
    request.headers.get("authorization") ?? request.headers.get("x-ingest-secret"),
    process.env.SOLVOL_INGEST_SECRET,
    process.env.SNAPSHOT_CRON_SECRET,
    process.env.CRON_SECRET,
  );
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const result = await runSourceIngest({
    limit: normalizeIngestLimit(url.searchParams.get("limit")),
  });
  return Response.json({ ok: true, ...result, fetchedAt: new Date().toISOString() });
}

export async function POST(request: Request) {
  return handleIngest(request);
}

export async function GET(request: Request) {
  return handleIngest(request);
}
