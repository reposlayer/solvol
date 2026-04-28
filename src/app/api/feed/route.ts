import { getRecentFeedMoves } from "@/lib/db/sqlite";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "12", 10);
  const items = getRecentFeedMoves(Number.isFinite(limit) ? limit : 12);
  return Response.json({ items, fetchedAt: new Date().toISOString() });
}
