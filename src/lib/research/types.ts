import type { MarketMoveExplanation } from "@/lib/domain/types";

export type PlanTier = "free" | "pro" | "team";

export type ResearchUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  plan: PlanTier;
  teamId: string | null;
  isDemo: boolean;
};

export type PlanLimits = {
  catalystRunsPerDay: number;
  savedMarkets: number;
  alerts: number;
  reports: number;
  teamSeats: number;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    catalystRunsPerDay: 8,
    savedMarkets: 25,
    alerts: 3,
    reports: 2,
    teamSeats: 1,
  },
  pro: {
    catalystRunsPerDay: 120,
    savedMarkets: 500,
    alerts: 50,
    reports: 60,
    teamSeats: 1,
  },
  team: {
    catalystRunsPerDay: 600,
    savedMarkets: 5000,
    alerts: 300,
    reports: 500,
    teamSeats: 25,
  },
};

export type SavedMarket = {
  id: string;
  marketId: string;
  marketTitle: string | null;
  folder: string;
  tags: string[];
  thesis: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResearchNote = {
  id: string;
  marketId: string | null;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedScan = {
  id: string;
  name: string;
  lane: string;
  filters: Record<string, unknown>;
  createdAt: string;
};

export type WorkspaceLayout = {
  id: string;
  name: string;
  layout: Record<string, unknown>;
  updatedAt: string;
};

export type ResearchWorkspace = {
  watchlist: string[];
  savedMarkets: SavedMarket[];
  notes: ResearchNote[];
  savedScans: SavedScan[];
  layouts: WorkspaceLayout[];
};

export type AlertKind =
  | "price_move"
  | "volume_spike"
  | "deadline_risk"
  | "new_related_market"
  | "catalyst_confidence"
  | "watched_market";

export type AlertRule = {
  id: string;
  marketId: string | null;
  name: string;
  kind: AlertKind;
  threshold: number | null;
  channel: "in_app_email";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AlertEvent = {
  id: string;
  alertId: string | null;
  marketId: string | null;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  readAt: string | null;
  createdAt: string;
};

export type SourceLedgerEntry = {
  id: string;
  catalystRunId: string | null;
  marketId: string;
  sourceType: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  entityMatches: string[];
  confidence: number;
  direction: string;
  evidence: string[];
};

export type CatalystRunRecord = {
  id: string;
  marketId: string;
  marketTitle: string;
  confidence: number;
  confidenceBand: string;
  movePercent: number;
  explanation: string;
  payload: MarketMoveExplanation;
  createdAt: string;
};

export type SavedReport = {
  id: string;
  title: string;
  marketIds: string[];
  bodyMd: string;
  shareToken: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResearchSessionPayload = {
  configured: boolean;
  user: ResearchUser;
  limits: PlanLimits;
};
