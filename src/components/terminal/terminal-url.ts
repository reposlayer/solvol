export function marketFocusHref(search: string, marketId: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("marketId", marketId);
  params.delete("autoExplain");
  return `/terminal?${params.toString()}`;
}
