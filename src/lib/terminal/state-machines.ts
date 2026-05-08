import type {
  EventClusterLifecycleStatus,
  EventLifecycleTransition,
  MarketStatus,
  MarketStatusTransition,
} from "./types";

type TransitionOpts = {
  at: string;
  reason: string;
};

const MARKET_STATUS_TRANSITIONS: Record<MarketStatus, readonly MarketStatus[]> = {
  open: ["open", "paused", "closed", "resolved"],
  paused: ["paused", "open", "closed", "resolved"],
  closed: ["closed", "resolved"],
  resolved: ["resolved"],
};

const EVENT_LIFECYCLE_TRANSITIONS: Record<EventClusterLifecycleStatus, readonly EventClusterLifecycleStatus[]> = {
  new: ["new", "developing", "corroborated", "contested", "refuted"],
  developing: ["developing", "corroborated", "contested", "refuted"],
  corroborated: ["corroborated", "contested", "refuted"],
  contested: ["contested", "corroborated", "refuted"],
  refuted: ["refuted"],
};

export function canTransitionMarketStatus(from: MarketStatus, to: MarketStatus): boolean {
  return MARKET_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionEventLifecycle(
  from: EventClusterLifecycleStatus,
  to: EventClusterLifecycleStatus,
): boolean {
  return EVENT_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function transitionMarketStatus(
  from: MarketStatus,
  to: MarketStatus,
  opts: TransitionOpts,
): MarketStatusTransition {
  const accepted = canTransitionMarketStatus(from, to);
  return {
    accepted,
    from,
    to,
    at: opts.at,
    reason: opts.reason,
    ruleId: accepted ? `market_state:${from}:${to}` : `market_state:invalid:${from}:${to}`,
  };
}

export function transitionEventLifecycle(
  from: EventClusterLifecycleStatus,
  to: EventClusterLifecycleStatus,
  opts: TransitionOpts,
): EventLifecycleTransition {
  const accepted = canTransitionEventLifecycle(from, to);
  return {
    accepted,
    from,
    to,
    at: opts.at,
    reason: opts.reason,
    ruleId: accepted ? `event_lifecycle:${from}:${to}` : `event_lifecycle:invalid:${from}:${to}`,
  };
}
