import type { MarketPricePoint } from "@/lib/terminal/types";

export function ProbabilityChart({
  history,
  height = 120,
}: {
  history: MarketPricePoint[];
  height?: number;
}) {
  const points = history.length
    ? history.map((point, index) => {
        const x = history.length === 1 ? 0 : (index / (history.length - 1)) * 100;
        const y = 100 - Math.max(0, Math.min(1, point.probability)) * 100;
        return `${x},${y}`;
      })
    : [];

  return (
    <svg viewBox="0 0 100 100" height={height} className="redesign-price-chart" role="img" aria-label="Probability chart">
      <polyline points={points.join(" ")} fill="none" stroke="var(--terminal-up)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
