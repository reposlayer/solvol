import { NextResponse } from "next/server";
import { fetchPolymarketMarketsWithFallback } from "@/lib/polymarket/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "80");
  const query = url.searchParams.get("q") ?? undefined;
  const payload = await fetchPolymarketMarketsWithFallback({
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 80,
    query,
  });

  return NextResponse.json(payload);
}
