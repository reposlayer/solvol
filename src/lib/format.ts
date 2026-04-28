export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function fmtCents(p: number | null | undefined, digits = 1): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(digits)}¢`;
}

export function fmtPct(
  pct: number | null | undefined,
  { sign = false, digits = 2 }: { sign?: boolean; digits?: number } = {},
): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const s = sign && pct >= 0 ? "+" : "";
  return `${s}${pct.toFixed(digits)}%`;
}

export function fmtMult(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}×`;
}

export function fmtHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function moveToneClass(pct: number | null | undefined): string {
  if (pct == null) return "text-[var(--terminal-muted)]";
  if (pct > 0.05) return "text-[var(--terminal-up)]";
  if (pct < -0.05) return "text-[var(--terminal-down)]";
  return "text-[var(--terminal-text-2)]";
}

export function fmtTime(ts: number | string | null | undefined): string {
  if (ts == null) return "—";
  const d = typeof ts === "number" ? new Date(ts * (ts < 1e12 ? 1000 : 1)) : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shorten(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
