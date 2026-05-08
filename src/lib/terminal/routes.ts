export type TerminalRouteId =
  | "overview"
  | "markets"
  | "trending"
  | "market-detail"
  | "movers"
  | "deadlines"
  | "sources"
  | "alerts"
  | "watchlist"
  | "status"
  | "positions"
  | "order-book"
  | "discovery"
  | "market-info"
  | "activity"
  | "settings";

export type TerminalWorkspaceMode = "mission" | "flow" | "research";

export type TerminalRoute = {
  id: TerminalRouteId;
  label: string;
  meta: string;
  pathTemplate: string;
  mode: TerminalWorkspaceMode;
  product: "polymarket";
  readOnly: true;
  lane?: "all_markets" | "hot" | "high_volume" | "closing_soon" | "new" | "research_worthy" | "deadline_risk" | "anomaly" | "catalyst_rich";
};

export const TERMINAL_ROUTES: TerminalRoute[] = [
  {
    id: "markets",
    label: "All Markets",
    meta: "Browse public market tape",
    pathTemplate: "/terminal/markets",
    mode: "mission",
    product: "polymarket",
    readOnly: true,
    lane: "all_markets",
  },
  {
    id: "trending",
    label: "Trending",
    meta: "Hot market pressure",
    pathTemplate: "/terminal/trending",
    mode: "mission",
    product: "polymarket",
    readOnly: true,
    lane: "hot",
  },
  {
    id: "market-detail",
    label: "Market Detail",
    meta: "Selected catalyst brief",
    pathTemplate: "/terminal/market/[id]",
    mode: "research",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "movers",
    label: "Movers",
    meta: "Movement, tape, liquidity",
    pathTemplate: "/terminal/movers",
    mode: "flow",
    product: "polymarket",
    readOnly: true,
    lane: "hot",
  },
  {
    id: "deadlines",
    label: "Deadlines",
    meta: "Closing and resolution risk",
    pathTemplate: "/terminal/deadlines",
    mode: "mission",
    product: "polymarket",
    readOnly: true,
    lane: "closing_soon",
  },
  {
    id: "sources",
    label: "Sources",
    meta: "Evidence and provenance",
    pathTemplate: "/terminal/sources",
    mode: "research",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "alerts",
    label: "Alerts",
    meta: "Local read-only rules",
    pathTemplate: "/terminal/alerts",
    mode: "mission",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "watchlist",
    label: "Watchlist",
    meta: "Pinned-only view",
    pathTemplate: "/terminal/watchlist",
    mode: "mission",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "status",
    label: "Data Sources",
    meta: "Live, mock and health",
    pathTemplate: "/terminal/status",
    mode: "research",
    product: "polymarket",
    readOnly: true,
  },
];

export const BLOOMBERG_TERMINAL_ROUTES = TERMINAL_ROUTES;

const AUXILIARY_TERMINAL_ROUTES: TerminalRoute[] = [
  {
    id: "overview",
    label: "Overview",
    meta: "Desk summary",
    pathTemplate: "/terminal/overview",
    mode: "mission",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "positions",
    label: "Positions",
    meta: "Read-only ledger",
    pathTemplate: "/terminal/positions",
    mode: "flow",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "order-book",
    label: "Order Book",
    meta: "Depth preview",
    pathTemplate: "/terminal/order-book",
    mode: "flow",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "discovery",
    label: "Discovery",
    meta: "Market scanner",
    pathTemplate: "/terminal/discovery",
    mode: "mission",
    product: "polymarket",
    readOnly: true,
    lane: "all_markets",
  },
  {
    id: "market-info",
    label: "Market Info",
    meta: "Rules and sources",
    pathTemplate: "/terminal/market-info",
    mode: "research",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "activity",
    label: "Activity",
    meta: "Tape and fills",
    pathTemplate: "/terminal/activity",
    mode: "flow",
    product: "polymarket",
    readOnly: true,
  },
  {
    id: "settings",
    label: "Settings",
    meta: "Terminal controls",
    pathTemplate: "/terminal/settings",
    mode: "research",
    product: "polymarket",
    readOnly: true,
  },
];

export function terminalRouteById(id: string | null | undefined): TerminalRoute | null {
  return (
    TERMINAL_ROUTES.find((route) => route.id === id) ??
    AUXILIARY_TERMINAL_ROUTES.find((route) => route.id === id) ??
    null
  );
}

export function terminalRouteHref(
  route: TerminalRoute,
  searchParams?: URLSearchParams,
  marketId?: string,
): string {
  const next = new URLSearchParams(searchParams?.toString());
  if (route.lane) next.set("lane", route.lane);
  if (!next.get("limit")) next.set("limit", "80");
  if (marketId) next.set("marketId", marketId);

  if (route.id === "market-detail") {
    const id = marketId && /^\d{3,}$/.test(marketId) ? marketId : next.get("marketId") ?? "540816";
    next.delete("marketId");
    const detailQuery = next.toString();
    return `/terminal/market/${encodeURIComponent(id)}${detailQuery ? `?${detailQuery}` : ""}`;
  }

  const query = next.toString();
  return `${route.pathTemplate}${query ? `?${query}` : ""}`;
}

export function terminalSectionFromPath(pathname: string | null | undefined): TerminalRoute | null {
  const path = pathname ?? "/terminal";
  if (/^\/(?:terminal\/market|market)\//.test(path)) return terminalRouteById("market-detail");
  if (path === "/terminal" || path === "/terminal/markets") return terminalRouteById("markets");
  const section = path.match(/^\/terminal\/([^/]+)/)?.[1];
  if (!section) return terminalRouteById("markets");
  return TERMINAL_ROUTES.find((route) => route.pathTemplate === `/terminal/${section}`) ?? terminalRouteById("markets");
}
