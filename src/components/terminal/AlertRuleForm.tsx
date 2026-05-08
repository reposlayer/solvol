"use client";

import { useState } from "react";
import type { AlertRule } from "@/lib/terminal/types";

export function AlertRuleForm({
  marketId,
  onCreate,
}: {
  marketId: string | null;
  onCreate: (rule: AlertRule) => void;
}) {
  const [name, setName] = useState("Probability jump");
  const [kind, setKind] = useState<AlertRule["kind"]>("probability_jump");
  const [threshold, setThreshold] = useState(0.08);

  return (
    <form
      className="terminal-alert-rule-form"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({
          id: `local-${Date.now().toString(36)}`,
          marketId,
          name: name.trim() || "Local alert",
          kind,
          threshold,
          windowMinutes: kind === "probability_cross" || kind === "watched_market" ? null : 30,
          enabled: true,
          createdAt: new Date().toISOString(),
        });
      }}
    >
      <input aria-label="Alert name" value={name} onChange={(event) => setName(event.target.value)} />
      <select
        aria-label="Alert kind"
        value={kind}
        onChange={(event) => setKind(event.target.value as AlertRule["kind"])}
      >
        <option value="probability_cross">Probability cross</option>
        <option value="probability_jump">Probability jump</option>
        <option value="volume_spike">Volume spike</option>
        <option value="whale_activity">Whale activity</option>
        <option value="watched_market">Watched market</option>
      </select>
      <input
        aria-label="Alert threshold"
        type="number"
        step="0.01"
        min="0"
        value={threshold}
        onChange={(event) => setThreshold(Number(event.target.value))}
      />
      <button type="submit">Arm</button>
    </form>
  );
}
