"use client";

export type ChartPoint = { t: number; p: number };
export type ChartMarker = {
  t: number;
  label?: string;
  color?: string;
  kind?: "event" | "jump";
  price?: number;
  note?: string;
  windowStart?: number;
  windowEnd?: number;
  direction?: "YES" | "NO";
};

function toPath(points: ChartPoint[], width: number, height: number): string {
  if (points.length === 0) return "";
  const minT = points[0]!.t;
  const maxT = points[points.length - 1]!.t;
  const minP = Math.max(0, Math.min(...points.map((point) => point.p)) - 0.05);
  const maxP = Math.min(1, Math.max(...points.map((point) => point.p)) + 0.05);
  const rangeT = Math.max(1, maxT - minT);
  const rangeP = Math.max(0.01, maxP - minP);
  return points
    .map((point, index) => {
      const x = ((point.t - minT) / rangeT) * width;
      const y = height - ((point.p - minP) / rangeP) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function PriceChart({
  history,
  showNo = true,
  height = 220,
  className = "",
}: {
  history: ChartPoint[];
  showNo?: boolean;
  height?: number;
  markers?: ChartMarker[];
  volumeBars?: { t: number; v: number }[];
  className?: string;
}) {
  const width = 640;
  const yesPath = toPath(history, width, height - 24);
  const noPath = showNo
    ? toPath(
        history.map((point) => ({ ...point, p: 1 - point.p })),
        width,
        height - 24,
      )
    : "";

  return (
    <div className={`terminal-price-chart ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="YES and NO price chart">
        <rect x="0" y="0" width={width} height={height} />
        {[0.25, 0.5, 0.75].map((line) => (
          <line key={line} x1="0" x2={width} y1={line * (height - 24)} y2={line * (height - 24)} />
        ))}
        <path className="terminal-chart-line is-primary" d={yesPath} />
        {showNo ? <path className="terminal-chart-line is-secondary" d={noPath} /> : null}
        {history.map((point, index) =>
          index % Math.ceil(Math.max(1, history.length / 18)) === 0 ? (
            <circle
              key={`${point.t}-${index}`}
              cx={(index / Math.max(1, history.length - 1)) * width}
              cy={(height - 24) - point.p * (height - 24)}
              r="2"
            />
          ) : null,
        )}
      </svg>
      <div className="terminal-chart-legend">
        <span>YES</span>
        <span>NO</span>
        <span>1D / 1W / 1M / ALL</span>
      </div>
    </div>
  );
}
