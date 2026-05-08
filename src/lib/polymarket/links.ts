type PolymarketLinkInput = {
  eventSlug?: string | null;
  question?: string | null;
  marketSlug?: string | null;
  id?: string | null;
};

function cleanSlug(value: string | null | undefined): string | null {
  const slug = value?.trim().replace(/^\/+|\/+$/g, "");
  return slug ? slug : null;
}

export function buildPolymarketSearchUrl(query?: string | null): string {
  const url = new URL("https://polymarket.com/search");
  const q = query?.trim() || "market";
  url.searchParams.set("q", q);
  return url.toString();
}

export function buildPolymarketMarketUrl({
  eventSlug,
  question,
  marketSlug,
  id,
}: PolymarketLinkInput): string {
  const event = cleanSlug(eventSlug);
  if (event) return `https://polymarket.com/event/${event}`;
  return buildPolymarketSearchUrl(question ?? marketSlug ?? id ?? "market");
}
