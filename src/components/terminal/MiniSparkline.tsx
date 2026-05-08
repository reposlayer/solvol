export function MiniSparkline({
  values,
  label = "Market sparkline",
}: {
  values: number[];
  label?: string;
}) {
  const points = values.length
    ? values.map((value, index) => {
        const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
        const y = 100 - Math.max(0, Math.min(1, value)) * 100;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
    : [];

  return (
    <svg className="terminal-mini-sparkline" viewBox="0 0 100 100" role="img" aria-label={label}>
      <polyline points={points.join(" ")} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
