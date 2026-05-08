import { StatusBadge, type StatusBadgeTone } from "@/components/terminal/StatusBadge";

export function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: StatusBadgeTone;
}) {
  return (
    <article className={`terminal-stat-card is-${tone}`}>
      <div className="terminal-stat-label">
        <span>{label}</span>
        <StatusBadge tone={tone}>{tone === "positive" ? "higher" : tone === "negative" ? "lower" : "flat"}</StatusBadge>
      </div>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}
