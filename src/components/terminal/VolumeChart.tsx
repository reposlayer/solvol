import type { MarketPricePoint } from "@/lib/terminal/types";

export function VolumeChart({
  history,
  height = 96,
}: {
  history: MarketPricePoint[];
  height?: number;
}) {
  const maxVolume = Math.max(1, ...history.map((point) => point.volumeUsd ?? 0));

  return (
    <div className="turbo-replay-track" style={{ height }} aria-label="Volume chart">
      {history.map((point) => (
        <span
          key={point.timestamp}
          className="is-up"
          style={{ height: `${Math.max(8, ((point.volumeUsd ?? 0) / maxVolume) * 100)}%` }}
          title={`${point.timestamp}: $${Math.round(point.volumeUsd ?? 0).toLocaleString()}`}
        />
      ))}
    </div>
  );
}
