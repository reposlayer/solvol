import type { ConfidenceBand } from "@/lib/domain/types";

export function toConfidenceBand(confidencePercent: number): ConfidenceBand {
  if (confidencePercent >= 70) return "high";
  if (confidencePercent >= 40) return "medium";
  return "low";
}
