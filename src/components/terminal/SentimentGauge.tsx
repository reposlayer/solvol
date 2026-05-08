export function SentimentGauge({
  value,
  label = "Market pressure",
}: {
  value: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const needle = -90 + clamped * 180;

  return (
    <div className="terminal-sentiment-gauge" aria-label={label}>
      <div className="terminal-gauge-arc">
        <i style={{ transform: `rotate(${needle}deg)` }} />
      </div>
      <strong>{Math.round(clamped * 100)}%</strong>
      <span>YES PRESSURE</span>
    </div>
  );
}
