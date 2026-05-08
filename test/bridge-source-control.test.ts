import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  buildTerminalSourceControlPlan,
} from "../src/lib/terminal/source-control.ts";

test("source control planner emits read-only pause and resume plans", () => {
  const pause = buildTerminalSourceControlPlan({
    action: "pause",
    sourceId: "gdelt-doc",
    reason: "rate-limit drill",
    now: "2026-05-07T12:00:00.000Z",
  });

  assert.equal(pause.readOnly, true);
  assert.equal(pause.dryRun, true);
  assert.equal(pause.ok, true);
  assert.equal(pause.sourceId, "gdelt-doc");
  assert.equal(pause.featureFlag, "bridge.ingest.source.gdelt-doc");
  assert.match(pause.operatorIntent, /pause/i);
  assert.match(pause.steps.join("\n"), /Preserve source cursor/i);
  assert.match(pause.steps.join("\n"), /Do not delete raw payload/i);

  const resume = buildTerminalSourceControlPlan({
    action: "resume",
    sourceId: "gdelt-doc",
    now: "2026-05-07T12:00:00.000Z",
  });

  assert.equal(resume.ok, true);
  assert.match(resume.operatorIntent, /resume/i);
  assert.match(resume.steps.join("\n"), /replay/i);
});

test("source control planner rejects unknown sources without mutation", () => {
  const plan = buildTerminalSourceControlPlan({
    action: "pause",
    sourceId: "not-a-source",
  });

  assert.equal(plan.readOnly, true);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.ok, false);
  assert.equal(plan.error, "unknown_source");
});

test("bridge pause and resume commands emit source-control plans", () => {
  const pause = JSON.parse(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/bridge.mjs", "bridge:pause-source", "--source=gdelt-doc", "--reason=outage"],
    { encoding: "utf8" },
  ));
  const resume = JSON.parse(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/bridge.mjs", "bridge:resume-source", "--source=gdelt-doc"],
    { encoding: "utf8" },
  ));

  assert.equal(pause.readOnly, true);
  assert.equal(pause.sourceControlPlan.ok, true);
  assert.match(pause.sourceControlPlan.operatorIntent, /pause/i);
  assert.equal(resume.readOnly, true);
  assert.equal(resume.sourceControlPlan.ok, true);
  assert.match(resume.sourceControlPlan.operatorIntent, /resume/i);
});
