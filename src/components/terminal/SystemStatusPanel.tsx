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
  const modeLabel = dataMode ?? status?.mode ?? "checking";
  const healthLabel = status ? (status.healthy === false ? "degraded" : "ok") : "checking";

  return (
    <div className="terminal-system-grid" aria-label="System status panel">
      <span>
        Source <strong>{status?.label ?? "Polymarket"}</strong>
      </span>
      <span>
        Mode <strong>{modeLabel}</strong>
      </span>
      <span>
        Read-only <strong>{status?.readOnly === false ? "no" : "yes"}</strong>
      </span>
      <span>
        Health <strong>{healthLabel}</strong>
      </span>
      {!dataMode && !status?.mode ? <em>Checking public data mode</em> : null}
      {dataMode === "mock" ? <em>Live unavailable, demo data shown</em> : null}
      {fallbackReason ? <em>{fallbackReason}</em> : null}
    </div>
  );
}
