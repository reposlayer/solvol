export function marketFocusHref(search: string, marketId: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("lane", params.get("lane") ?? "all_markets");
  if (!params.get("limit")) params.set("limit", "80");
  params.delete("marketId");
  params.delete("autoExplain");
  params.delete("section");
  return `/terminal/market/${encodeURIComponent(marketId)}?${params.toString()}`;
}
