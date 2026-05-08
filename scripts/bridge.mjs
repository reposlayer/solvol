#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvLine(line) {
  let trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (trimmed.startsWith("export ")) trimmed = trimmed.slice("export ".length).trimStart();

  const separator = trimmed.indexOf("=");
  if (separator <= 0) return null;

  const name = trimmed.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;

  let value = trimmed.slice(separator + 1).trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
    if (quote === "\"") {
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\");
    }
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }

  return [name, value];
}

function loadBridgeEnvFiles(cwd = process.cwd()) {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(cwd, filename);
    if (!existsSync(path)) continue;

    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [name, value] = parsed;
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }
}

loadBridgeEnvFiles();

const { bridgeCommandManifest, readBridgeFeatureFlags } = await import("../src/lib/terminal/bridge-control.ts");

const [commandName, ...args] = process.argv.slice(2);
const command = bridgeCommandManifest.find((entry) => entry.name === commandName);

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return undefined;
}

if (!command) {
  console.error(JSON.stringify({
    ok: false,
    readOnly: true,
    error: "unknown_bridge_command",
    command: commandName || null,
    availableCommands: bridgeCommandManifest.map((entry) => entry.name),
  }, null, 2));
  process.exit(1);
}

const payload = {
  ok: true,
  readOnly: command.readOnly,
  dryRun: true,
  command: command.name,
  description: command.description,
  args,
  featureFlags: readBridgeFeatureFlags(),
};

if (command.name === "bridge:backfill:markets" || command.name === "bridge:backfill:source") {
  const { buildTerminalBackfillPlan } = await import("../src/lib/terminal/backfill.ts");
  payload.backfillPlan = buildTerminalBackfillPlan({
    kind: command.name === "bridge:backfill:markets" ? "markets" : "source",
    sourceId: argValue("source"),
    since: argValue("since"),
    until: argValue("until"),
    now: argValue("now"),
  });
}

if (command.name === "bridge:replay") {
  const rawBlobKeys = [
    ...args
      .filter((arg) => arg.startsWith("--raw-blob-key="))
      .map((arg) => arg.slice("--raw-blob-key=".length)),
    ...(argValue("rawBlobKey") ? [argValue("rawBlobKey")] : []),
  ].flatMap((value) => value ? value.split(",") : []);
  if (rawBlobKeys.length > 0) {
    const { replayRawPayloadsFromStore } = await import("../src/lib/terminal/replay.ts");
    const { createConfiguredRawPayloadReader } = await import("../src/lib/terminal/raw-store.ts");
    payload.replayResult = await replayRawPayloadsFromStore({
      rawBlobKeys,
      rawStore: createConfiguredRawPayloadReader(),
      now: argValue("now"),
    });
  } else {
    payload.replayPlan = {
      readOnly: true,
      dryRun: true,
      fixture: argValue("fixture"),
      steps: [
        "Resolve raw payload keys from the supplied fixture or raw-blob-key arguments.",
        "Read immutable raw payload envelopes through the configured raw payload reader.",
        "Replay normalization, dedupe, clustering, and why-moved scoring without writes.",
      ],
    };
  }
}

if (command.name === "bridge:inject:synthetic") {
  const {
    TERMINAL_SYNTHETIC_SCENARIOS,
    buildTerminalSyntheticScenario,
  } = await import("../src/lib/terminal/synthetic.ts");
  const scenario = argValue("scenario") ?? "breaking-news-spike";
  if (!TERMINAL_SYNTHETIC_SCENARIOS.includes(scenario)) {
    console.error(JSON.stringify({
      ok: false,
      readOnly: true,
      error: "unknown_synthetic_scenario",
      scenario,
      availableScenarios: TERMINAL_SYNTHETIC_SCENARIOS,
    }, null, 2));
    process.exit(1);
  }
  payload.syntheticScenario = buildTerminalSyntheticScenario({
    scenario,
    now: argValue("now"),
    marketId: argValue("market") ?? argValue("market-id"),
  });
}

if (command.name === "bridge:retention:plan") {
  const { buildTerminalRetentionPlan } = await import("../src/lib/terminal/retention.ts");
  payload.retentionPlan = buildTerminalRetentionPlan({
    now: argValue("now"),
  });
}

if (command.name === "bridge:audit") {
  const { buildTerminalBridgeCompletionAudit } = await import("../src/lib/terminal/completion-audit.ts");
  payload.completionAudit = buildTerminalBridgeCompletionAudit();
}

if (command.name === "bridge:pause-source" || command.name === "bridge:resume-source") {
  const { buildTerminalSourceControlPlan } = await import("../src/lib/terminal/source-control.ts");
  payload.sourceControlPlan = buildTerminalSourceControlPlan({
    action: command.name === "bridge:pause-source" ? "pause" : "resume",
    sourceId: argValue("source"),
    reason: argValue("reason"),
    now: argValue("now"),
  });
}

if (command.name === "bridge:canary:check") {
  const { evaluateTerminalBridgeCanaryReadiness } = await import("../src/lib/terminal/canary-readiness.ts");
  const { buildTerminalBridgeCanaryHandoff } = await import("../src/lib/terminal/canary-handoff.ts");
  payload.canaryReadiness = evaluateTerminalBridgeCanaryReadiness();
  payload.canaryHandoff = buildTerminalBridgeCanaryHandoff();
}

if (command.name === "bridge:canary:env-template") {
  const { buildTerminalBridgeCanaryEnvTemplate } = await import("../src/lib/terminal/canary-handoff.ts");
  payload.canaryEnvTemplate = buildTerminalBridgeCanaryEnvTemplate();
}

console.log(JSON.stringify(payload, null, 2));
