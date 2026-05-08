import test from "node:test";
import assert from "node:assert/strict";
import { getSignalWorkflow } from "../src/components/terminal/signal-workflow.ts";

test("signal workflow presents information as a user journey", () => {
  const workflow = getSignalWorkflow("mission");

  assert.deepEqual(
    workflow.steps.map((step) => step.id),
    ["inbox", "brief", "evidence", "action"],
  );
  assert.equal(workflow.steps[0]?.title, "Signal Inbox");
  assert.equal(workflow.steps[1]?.title, "Market Brief");
});

test("flow mode changes the evidence priority without changing the journey", () => {
  const workflow = getSignalWorkflow("flow");

  assert.deepEqual(workflow.primaryEvidence, ["flow", "book", "prints", "deadline"]);
  assert.deepEqual(
    workflow.steps.map((step) => step.id),
    ["inbox", "brief", "evidence", "action"],
  );
});

test("research mode leads with sources and notes", () => {
  const workflow = getSignalWorkflow("research");

  assert.deepEqual(workflow.primaryEvidence, ["catalyst", "sources", "notes", "reports"]);
  assert.equal(workflow.mobileDefaultStep, "brief");
});
