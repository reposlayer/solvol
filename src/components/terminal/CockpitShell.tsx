"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  CockpitLayoutPlan,
  CockpitMobileTab,
  CockpitPanelKey,
  CockpitStepId,
  CockpitWorkflowSection,
} from "@/components/terminal/cockpit-layout";

type PanelRenderers = Partial<Record<CockpitPanelKey, () => ReactNode>>;

type CockpitShellProps = {
  plan: CockpitLayoutPlan;
  overview: () => ReactNode;
  panels: PanelRenderers;
};

function useDesktopLayout(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return desktop;
}

function renderPanel(key: CockpitPanelKey, panels: PanelRenderers): ReactNode {
  return panels[key]?.() ?? null;
}

function PanelStack({
  keys,
  panels,
  className,
}: {
  keys: CockpitPanelKey[];
  panels: PanelRenderers;
  className?: string;
}) {
  return (
    <div className={`grid min-h-0 min-w-0 content-start gap-2 ${className ?? ""}`}>
      {keys.map((key) => (
        <div key={key} className="min-h-0 min-w-0">
          {renderPanel(key, panels)}
        </div>
      ))}
    </div>
  );
}

function isCockpitStepId(value: unknown): value is CockpitStepId {
  return value === "inbox" || value === "brief" || value === "evidence" || value === "action";
}

function WorkflowSection({
  section,
  index,
  panels,
}: {
  section: CockpitWorkflowSection;
  index: number;
  panels: PanelRenderers;
}) {
  return (
    <section className={`cockpit-workflow-section cockpit-workflow-${section.id}`}>
      <header className="cockpit-workflow-head">
        <div>
          <span>
            0{index + 1} / {section.label}
          </span>
          <h2>{section.title}</h2>
        </div>
        <p>{section.intent}</p>
      </header>
      <PanelStack keys={section.panels} panels={panels} className="cockpit-workflow-body" />
    </section>
  );
}

function MobileTabs({
  tabs,
  panels,
  defaultStep,
}: {
  tabs: CockpitMobileTab[];
  panels: PanelRenderers;
  defaultStep: CockpitStepId;
}) {
  const [active, setActive] = useState<CockpitMobileTab["id"]>(defaultStep);

  useEffect(() => {
    function onSignalStep(event: Event) {
      const detail = (event as CustomEvent<{ step?: unknown }>).detail;
      if (isCockpitStepId(detail?.step)) setActive(detail.step);
    }
    window.addEventListener("solvol:signal-step", onSignalStep);
    return () => window.removeEventListener("solvol:signal-step", onSignalStep);
  }, []);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === active) ?? tabs[0]!,
    [active, tabs],
  );

  return (
    <div className="min-h-0 min-w-0">
      <div className="cockpit-mobile-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={activeTab.id === tab.id ? "is-active" : ""}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section className="cockpit-mobile-section">
        <header className="cockpit-workflow-head">
          <div>
            <span>{activeTab.label}</span>
            <h2>{activeTab.title}</h2>
          </div>
          <p>{activeTab.intent}</p>
        </header>
        <PanelStack keys={activeTab.panels} panels={panels} className="cockpit-workflow-body" />
      </section>
    </div>
  );
}

export function CockpitShell({ plan, overview, panels }: CockpitShellProps) {
  const desktop = useDesktopLayout();

  return (
    <div className="cockpit-shell tscroll flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--terminal-bg)]">
      <div className="shrink-0 p-2 pb-0">{overview()}</div>

      <div className="cockpit-title-row">
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--terminal-muted)]">
            {plan.mode}
          </div>
          <div className="truncate text-[15px] font-semibold text-[var(--terminal-text)]">
            {plan.title}
          </div>
        </div>
        <div className="ml-auto hidden min-w-0 max-w-xl truncate font-mono text-[10px] text-[var(--terminal-muted)] sm:block">
          {plan.intent}
        </div>
      </div>

      {desktop ? (
        <div className="cockpit-workflow-grid">
          {plan.workflow.map((section, index) => (
            <WorkflowSection key={section.id} section={section} index={index} panels={panels} />
          ))}
        </div>
      ) : (
        <MobileTabs
          key={plan.mode}
          tabs={plan.mobileTabs}
          panels={panels}
          defaultStep={plan.mobileDefaultStep}
        />
      )}
    </div>
  );
}
