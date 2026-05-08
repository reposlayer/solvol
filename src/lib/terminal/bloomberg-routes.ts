import {
  TERMINAL_ROUTES,
  terminalRouteById,
  terminalRouteHref,
  terminalSectionFromPath,
  type TerminalRoute,
  type TerminalRouteId,
} from "./routes.ts";

export type BloombergTerminalRouteId = TerminalRouteId;
export type BloombergTerminalRoute = TerminalRoute;

export const BLOOMBERG_TERMINAL_ROUTES = TERMINAL_ROUTES;

export function bloombergRouteById(id: string | null | undefined): BloombergTerminalRoute | null {
  return terminalRouteById(id);
}

export function bloombergRouteHref(route: BloombergTerminalRoute, marketId?: string): string {
  return terminalRouteHref(route, undefined, marketId);
}

export function bloombergSectionFromPath(pathname: string | null | undefined): BloombergTerminalRoute | null {
  return terminalSectionFromPath(pathname);
}
