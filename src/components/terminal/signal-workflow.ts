import type { WorkspaceMode } from "@/components/terminal/terminal-context";

export type SignalStepId = "inbox" | "brief" | "evidence" | "action";

export type SignalEvidenceKey =
  | "price"
  | "flow"
  | "book"
  | "prints"
  | "deadline"
  | "news"
  | "catalyst"
  | "sources"
  | "notes"
  | "reports";

export type SignalWorkflowStep = {
  id: SignalStepId;
  title: string;
  intent: string;
};

export type SignalWorkflow = {
  mode: WorkspaceMode;
  title: string;
  steps: SignalWorkflowStep[];
  primaryEvidence: SignalEvidenceKey[];
  mobileDefaultStep: SignalStepId;
};

const STEPS: SignalWorkflowStep[] = [
  {
    id: "inbox",
    title: "Signal Inbox",
    intent: "Receive ranked markets as readable alerts, not rows.",
  },
  {
    id: "brief",
    title: "Market Brief",
    intent: "Understand the selected market in one story-first view.",
  },
  {
    id: "evidence",
    title: "Evidence Trail",
    intent: "Check price, flow, news, and research evidence in order.",
  },
  {
    id: "action",
    title: "Action Dock",
    intent: "Run catalyst, pin, save, open, or move to the next market.",
  },
];

export function getSignalWorkflow(mode: WorkspaceMode): SignalWorkflow {
  if (mode === "flow") {
    return {
      mode,
      title: "Flow Review",
      steps: STEPS,
      primaryEvidence: ["flow", "book", "prints", "deadline"],
      mobileDefaultStep: "brief",
    };
  }

  if (mode === "research") {
    return {
      mode,
      title: "Research Review",
      steps: STEPS,
      primaryEvidence: ["catalyst", "sources", "notes", "reports"],
      mobileDefaultStep: "brief",
    };
  }

  return {
    mode,
    title: "Signal Review",
    steps: STEPS,
    primaryEvidence: ["price", "flow", "news", "catalyst"],
    mobileDefaultStep: "brief",
  };
}
