import type { MarketSourceStatus } from "@/lib/terminal/types";

export function SystemStatusPanel({
  status,
  dataMode,
  fallbackReason,
}: {
  status?: MarketSourceStatus;
  dataMode?: string;
  fallbackReason?: string;
}) {
  return (
    <div className="terminal-system-grid" aria-label="System status panel">
      <span>
        Source <strong>{status?.label ?? "Polymarket"}</strong>
      </span>
      <span>
        Mode <strong>{dataMode ?? status?.mode ?? "real"}</strong>
      </span>
      <span>
        Read-only <strong>{status?.readOnly === false ? "no" : "yes"}</strong>
      </span>
      <span>
        Health <strong>{status?.healthy === false ? "degraded" : "ok"}</strong>
      </span>
      {dataMode === "mock" ? <em>Live unavailable, demo data shown</em> : null}
      {fallbackReason ? <em>{fallbackReason}</em> : null}
    </div>
  );
}
