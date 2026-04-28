import { unstable_cache } from "next/cache";
import {
  fetchDiscoveryLane,
  isDiscoveryLane,
  type DiscoveryLane,
} from "@/lib/polymarket/discovery";

export const runtime = "nodejs";

/** Short TTL aligns with React Query `staleTime` / hot-lane CLOB batch cost. */
const cachedFetchDiscoveryLane = unstable_cache(
  async (
    lane: DiscoveryLane,
    limit: number,
    closingWithinHours: number,
    tagId: string | undefined,
  ) =>
    fetchDiscoveryLane(lane, {
      limit,
      closingWithinHours,
      tagId,
    }),
  ["discovery-lane"],
  { revalidate: 45 },
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const laneRaw = url.searchParams.get("lane") ?? "hot";
  const limitRaw = url.searchParams.get("limit");
  const hoursRaw = url.searchParams.get("hours");
  const tagIdRaw = url.searchParams.get("tag_id");

  const lane: DiscoveryLane = isDiscoveryLane(laneRaw) ? laneRaw : "hot";
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 40;
  const closingWithinHours = hoursRaw ? Number.parseInt(hoursRaw, 10) : 168;
  const tagId =
    tagIdRaw && /^\d+$/.test(tagIdRaw.trim()) ? tagIdRaw.trim() : undefined;

  try {
    const items = await cachedFetchDiscoveryLane(
      lane,
      Number.isFinite(limit) ? limit : 40,
      Number.isFinite(closingWithinHours) ? closingWithinHours : 168,
      tagId,
    );

    return Response.json({
      lane,
      fetchedAt: new Date().toISOString(),
      items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
