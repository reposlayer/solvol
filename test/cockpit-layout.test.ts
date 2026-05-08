import test from "node:test";
import assert from "node:assert/strict";
import { getCockpitLayoutPlan } from "../src/components/terminal/cockpit-layout.ts";

test("mission cockpit centers the selected market decision", () => {
  const plan = getCockpitLayoutPlan("mission");

  assert.equal(plan.title, "Mission Cockpit");
  assert.deepEqual(plan.center, ["market"]);
  assert.deepEqual(plan.primaryRail, ["scanner", "opportunity-radar"]);
  assert.deepEqual(plan.evidenceRail, ["market-lens", "depth", "tape", "news", "watchlist"]);
});

test("mission cockpit is arranged as inbox, brief, evidence, action", () => {
  const plan = getCockpitLayoutPlan("mission");

  assert.deepEqual(
    plan.workflow.map((section) => section.id),
    ["inbox", "brief", "evidence", "action"],
  );
  assert.deepEqual(
    plan.workflow.map((section) => section.title),
    ["Signal Inbox", "Market Brief", "Evidence Trail", "Action Dock"],
  );
  assert.deepEqual(plan.workflow[0]?.panels, ["scanner", "opportunity-radar"]);
  assert.deepEqual(plan.workflow[1]?.panels, ["market"]);
  assert.deepEqual(plan.workflow[2]?.panels, ["market-lens", "depth", "tape", "news"]);
  assert.deepEqual(plan.workflow[3]?.panels, ["research-desk", "watchlist", "scratchpad"]);
});

test("flow canvas promotes movement and deadline evidence", () => {
  const plan = getCockpitLayoutPlan("flow");

  assert.equal(plan.title, "Flow Canvas");
  assert.deepEqual(plan.primaryRail, ["scanner", "flow-alerts"]);
  assert.deepEqual(plan.center, ["market", "depth", "tape"]);
  assert.deepEqual(plan.evidenceRail, ["news", "resolution-queue", "watchlist"]);
});

test("research canvas keeps research tools together and exposes compact tabs", () => {
  const plan = getCockpitLayoutPlan("research");

  assert.equal(plan.title, "Research Canvas");
  assert.deepEqual(plan.center, ["market", "research-desk"]);
  assert.deepEqual(plan.evidenceRail, ["market-lens", "news", "compare", "scratchpad"]);
  assert.deepEqual(
    plan.mobileTabs.map((tab) => tab.label),
    ["Inbox", "Brief", "Evidence", "Action"],
  );
  assert.deepEqual(plan.workflow[3]?.panels, ["research-desk", "scratchpad"]);
});
