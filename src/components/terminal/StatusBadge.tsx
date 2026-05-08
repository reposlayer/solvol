import type { ReactNode } from "react";

export type StatusBadgeTone = "neutral" | "positive" | "negative" | "muted" | "outline";

const TONE_LABEL: Record<StatusBadgeTone, string> = {
  neutral: "NEU",
  positive: "UP",
  negative: "DN",
  muted: "OFF",
  outline: "SYS",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusBadgeTone;
}) {
  return (
    <span className={`terminal-status-badge is-${tone}`}>
      <span aria-hidden="true">{TONE_LABEL[tone]}</span>
      {children}
    </span>
  );
}
