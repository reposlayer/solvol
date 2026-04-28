/** Shared URL modifiers for `/terminal` and `/api/discovery`. */

export const DISCOVERY_DEFAULT_LIMIT = 40;

/** Default horizon for `closing_soon` (Gamma / API match). */
export const DISCOVERY_DEFAULT_CLOSING_HOURS = 168;

export function parseDiscoveryLimitFromSearch(raw: string | null): number {
  if (raw == null || raw === "") return DISCOVERY_DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DISCOVERY_DEFAULT_LIMIT;
  return Math.min(n, 80);
}

export function parseClosingHoursFromSearch(raw: string | null): number {
  if (raw == null || raw === "") return DISCOVERY_DEFAULT_CLOSING_HOURS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DISCOVERY_DEFAULT_CLOSING_HOURS;
  return Math.min(Math.max(n, 1), 8760);
}

export function parseTagIdFromSearch(raw: string | null): string | null {
  if (raw == null || raw === "") return null;
  const t = raw.trim();
  return /^\d+$/.test(t) ? t : null;
}
