import { unstable_cache } from "next/cache";
import {
  fetchDiscoveryLane,
  isDiscoveryLane,
  type DiscoveryLane,
} from "@/lib/polymarket/discovery";
import {
  DISCOVERY_DEFAULT_CLOSING_HOURS,
  DISCOVERY_DEFAULT_LIMIT,
} from "@/hooks/discovery-url";
import { TERMINAL_REFRESH } from "@/hooks/terminal-refresh";
import { researchErrorResponse } from "@/lib/research/http";
import { ResearchStoreError, userFromRequest } from "@/lib/research/supabase";
import { mockDiscoveryRows } from "@/lib/terminal/api-demo";

export const runtime = "nodejs";

/** Short TTL aligns with React Query `staleTime` / hot-lane CLOB batch cost. */
const cachedFetchDiscoveryLane = unstable_cache(
  async (
    lane: DiscoveryLane,
    limit: number,
    closingWithinHours: number,
    tagId: string | undefined,
    offset: number,
    query: string | undefined,
  ) =>
    fetchDiscoveryLane(lane, {
      limit,
      closingWithinHours,
      tagId,
      offset,
      query,
    }),
  ["discovery-lane"],
  { revalidate: TERMINAL_REFRESH.discovery.serverRevalidateSeconds },
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const laneRaw = url.searchParams.get("lane") ?? "all_markets";
  const limitRaw = url.searchParams.get("limit");
  const hoursRaw = url.searchParams.get("hours");
  const tagIdRaw = url.searchParams.get("tag_id");
  const offsetRaw = url.searchParams.get("offset");
  const queryRaw = url.searchParams.get("q");

  const lane: DiscoveryLane = isDiscoveryLane(laneRaw) ? laneRaw : "all_markets";
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : DISCOVERY_DEFAULT_LIMIT;
  const closingWithinHours = hoursRaw ? Number.parseInt(hoursRaw, 10) : DISCOVERY_DEFAULT_CLOSING_HOURS;
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
  const tagId =
    tagIdRaw && /^\d+$/.test(tagIdRaw.trim()) ? tagIdRaw.trim() : undefined;
  const query = queryRaw?.trim() || undefined;

  try {
    await userFromRequest(request);
    const items = await cachedFetchDiscoveryLane(
      lane,
      Number.isFinite(limit) ? limit : DISCOVERY_DEFAULT_LIMIT,
      Number.isFinite(closingWithinHours) ? closingWithinHours : DISCOVERY_DEFAULT_CLOSING_HOURS,
      tagId,
      Number.isFinite(offset) && offset > 0 ? offset : 0,
      query,
    );

    return Response.json({
      lane,
      fetchedAt: new Date().toISOString(),
      dataMode: "real",
      items,
    });
  } catch (err) {
    if (err instanceof ResearchStoreError) return researchErrorResponse(err);
    const items = await mockDiscoveryRows(lane, {
      limit: Number.isFinite(limit) ? limit : DISCOVERY_DEFAULT_LIMIT,
      tagId,
      query,
    });
    if (process.env.SOLVOL_DISABLE_MOCK_FALLBACK !== "true") {
      return Response.json({
        lane,
        fetchedAt: new Date().toISOString(),
        dataMode: "mock",
        fallbackReason: err instanceof Error ? err.message : "Discovery failed",
        items,
      });
    }
    const message = err instanceof Error ? err.message : "Discovery failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
