import type {
  AlertEvent,
  AlertRule,
  Market,
  MarketMove,
  WalletActivity,
} from "./types";

export type AlertEvaluationInput = {
  rules: AlertRule[];
  markets: Market[];
  moves: MarketMove[];
  walletActivity: WalletActivity[];
  watchedMarketIds?: string[];
  now?: string;
};

function activeRules(rules: AlertRule[]): AlertRule[] {
  return rules.filter((rule) => rule.enabled);
}

function matchesRuleMarket(rule: AlertRule, marketId: string | null): boolean {
  return !rule.marketId || rule.marketId === marketId;
}

function latestMoveForMarket(moves: MarketMove[], marketId: string): MarketMove | null {
  return (
    moves
      .filter((move) => move.marketId === marketId)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null
  );
}

function latestWalletForRule(
  wallets: WalletActivity[],
  rule: AlertRule,
): WalletActivity | null {
  return (
    wallets
      .filter((wallet) => matchesRuleMarket(rule, wallet.marketId))
      .filter((wallet) => wallet.notionalUsd >= rule.threshold)
      .sort((a, b) => b.notionalUsd - a.notionalUsd || Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null
  );
}

function volumeSpikeRatio(market: Market): number {
  const dailyBaseline = market.volume7d > 0 ? market.volume7d / 7 : market.volume24h;
  return dailyBaseline > 0 ? market.volume24h / dailyBaseline : 0;
}

function formatCents(value: number): string {
  return `${(value * 100).toFixed(1)}c`;
}

function severityForProbability(probability: number): AlertEvent["severity"] {
  if (probability >= 0.85 || probability <= 0.15) return "critical";
  if (probability >= 0.65 || probability <= 0.35) return "warning";
  return "info";
}

function event(
  rule: AlertRule,
  marketId: string | null,
  title: string,
  body: string,
  severity: AlertEvent["severity"],
  now: string,
  anchor: string,
): AlertEvent {
  return {
    id: `local-alert:${rule.id}:${marketId ?? "global"}:${rule.kind}:${anchor}`,
    ruleId: rule.id,
    marketId,
    title,
    body,
    severity,
    timestamp: now,
    read: false,
  };
}

export function evaluateAlertRules(input: AlertEvaluationInput): AlertEvent[] {
  const now = input.now ?? new Date().toISOString();
  const watched = new Set(input.watchedMarketIds ?? []);
  const events: AlertEvent[] = [];

  for (const rule of activeRules(input.rules)) {
    if (rule.kind === "whale_activity") {
      const wallet = latestWalletForRule(input.walletActivity, rule);
      if (!wallet) continue;
      events.push(
        event(
          rule,
          wallet.marketId,
          `${rule.name}: whale ${wallet.side} ${wallet.outcome}`,
          `${wallet.label ?? wallet.walletAddress} printed $${Math.round(wallet.notionalUsd).toLocaleString()} notional at ${formatCents(wallet.price)}.`,
          "critical",
          now,
          wallet.id,
        ),
      );
      continue;
    }

    for (const market of input.markets) {
      if (!matchesRuleMarket(rule, market.id)) continue;

      if (rule.kind === "probability_cross" && market.probability >= rule.threshold) {
        events.push(
          event(
            rule,
            market.id,
            `${rule.name}: probability crossed`,
            `${market.title} is now ${formatCents(market.probability)}, above the ${formatCents(rule.threshold)} rule.`,
            severityForProbability(market.probability),
            now,
            market.updatedAt,
          ),
        );
        break;
      }

      if (rule.kind === "probability_jump") {
        const move = latestMoveForMarket(input.moves, market.id);
        if (!move) continue;
        const delta = Math.abs(move.probabilityAfter - move.probabilityBefore);
        const windowOk = !rule.windowMinutes || move.windowMinutes <= rule.windowMinutes;
        if (delta >= rule.threshold && windowOk) {
          events.push(
            event(
              rule,
              market.id,
              `${rule.name}: jump detected`,
              `${market.title} moved ${formatCents(move.probabilityBefore)} to ${formatCents(move.probabilityAfter)} in ${move.windowMinutes}m.`,
              delta >= 0.15 ? "critical" : "warning",
              now,
              move.id,
            ),
          );
          break;
        }
      }

      if (rule.kind === "volume_spike") {
        const ratio = volumeSpikeRatio(market);
        if (ratio >= rule.threshold) {
          events.push(
            event(
              rule,
              market.id,
              `${rule.name}: unusual volume`,
              `${market.title} is running at ${ratio.toFixed(1)}x baseline volume.`,
              ratio >= 5 ? "critical" : "warning",
              now,
              market.updatedAt,
            ),
          );
          break;
        }
      }

      if (rule.kind === "watched_market" && watched.has(market.id)) {
        events.push(
          event(
            rule,
            market.id,
            `${rule.name}: watched market active`,
            `${market.title} is on the local watchlist and remains in the active terminal set.`,
            "info",
            now,
            market.updatedAt,
          ),
        );
        break;
      }
    }
  }

  return events;
}
