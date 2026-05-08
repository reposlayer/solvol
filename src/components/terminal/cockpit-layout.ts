export type CockpitMode = "mission" | "flow" | "research";

export type CockpitStepId = "inbox" | "brief" | "evidence" | "action";

export type CockpitPanelKey =
  | "scanner"
  | "market"
  | "market-lens"
  | "research-desk"
  | "flow-alerts"
  | "opportunity-radar"
  | "resolution-queue"
  | "watchlist"
  | "depth"
  | "tape"
  | "news"
  | "compare"
  | "scratchpad";

export type CockpitMobileTab = {
  id: CockpitStepId;
  label: string;
  title: string;
  intent: string;
  panels: CockpitPanelKey[];
};

export type CockpitWorkflowSection = {
  id: CockpitStepId;
  label: string;
  title: string;
  intent: string;
  panels: CockpitPanelKey[];
};

export type CockpitLayoutPlan = {
  mode: CockpitMode;
  title: string;
  intent: string;
  primaryRail: CockpitPanelKey[];
  center: CockpitPanelKey[];
  evidenceRail: CockpitPanelKey[];
  workflow: CockpitWorkflowSection[];
  mobileDefaultStep: CockpitStepId;
  mobileTabs: CockpitMobileTab[];
};

type WorkflowPanels = Record<CockpitStepId, CockpitPanelKey[]>;

const WORKFLOW_STEPS: Omit<CockpitWorkflowSection, "panels">[] = [
  {
    id: "inbox",
    label: "Inbox",
    title: "Signal Inbox",
    intent: "Receive ranked markets as readable alerts, not rows.",
  },
  {
    id: "brief",
    label: "Brief",
    title: "Market Brief",
    intent: "Understand the selected market in one story-first view.",
  },
  {
    id: "evidence",
    label: "Evidence",
    title: "Evidence Trail",
    intent: "Check price, flow, news, and research evidence in order.",
  },
  {
    id: "action",
    label: "Action",
    title: "Action Dock",
    intent: "Run catalyst, pin, save, open, or move to the next market.",
  },
];

function buildWorkflow(panels: WorkflowPanels): CockpitWorkflowSection[] {
  return WORKFLOW_STEPS.map((step) => ({
    ...step,
    panels: panels[step.id],
  }));
}

function buildPlan({
  mode,
  title,
  intent,
  primaryRail,
  center,
  evidenceRail,
  workflowPanels,
}: {
  mode: CockpitMode;
  title: string;
  intent: string;
  primaryRail: CockpitPanelKey[];
  center: CockpitPanelKey[];
  evidenceRail: CockpitPanelKey[];
  workflowPanels: WorkflowPanels;
}): CockpitLayoutPlan {
  const workflow = buildWorkflow(workflowPanels);
  return {
    mode,
    title,
    intent,
    primaryRail,
    center,
    evidenceRail,
    workflow,
    mobileDefaultStep: "brief",
    mobileTabs: workflow.map((section) => ({
      id: section.id,
      label: section.label,
      title: section.title,
      intent: section.intent,
      panels: section.panels,
    })),
  };
}

const PLANS: Record<CockpitMode, CockpitLayoutPlan> = {
  mission: buildPlan({
    mode: "mission",
    title: "Mission Cockpit",
    intent: "Choose the market, read the move, take the next action.",
    primaryRail: ["scanner", "opportunity-radar"],
    center: ["market"],
    evidenceRail: ["market-lens", "depth", "tape", "news", "watchlist"],
    workflowPanels: {
      inbox: ["scanner", "opportunity-radar"],
      brief: ["market"],
      evidence: ["market-lens", "depth", "tape", "news"],
      action: ["research-desk", "watchlist", "scratchpad"],
    },
  }),
  flow: buildPlan({
    mode: "flow",
    title: "Flow Canvas",
    intent: "React to movement, liquidity, prints, and deadline pressure.",
    primaryRail: ["scanner", "flow-alerts"],
    center: ["market", "depth", "tape"],
    evidenceRail: ["news", "resolution-queue", "watchlist"],
    workflowPanels: {
      inbox: ["scanner", "flow-alerts"],
      brief: ["market"],
      evidence: ["depth", "tape", "news", "resolution-queue"],
      action: ["market-lens", "watchlist", "scratchpad"],
    },
  }),
  research: buildPlan({
    mode: "research",
    title: "Research Canvas",
    intent: "Build a thesis from catalysts, sources, notes, and saved work.",
    primaryRail: ["scanner", "watchlist"],
    center: ["market", "research-desk"],
    evidenceRail: ["market-lens", "news", "compare", "scratchpad"],
    workflowPanels: {
      inbox: ["scanner", "watchlist"],
      brief: ["market", "market-lens"],
      evidence: ["news", "compare"],
      action: ["research-desk", "scratchpad"],
    },
  }),
};

export function getCockpitLayoutPlan(mode: CockpitMode): CockpitLayoutPlan {
  return PLANS[mode] ?? PLANS.mission;
}
