#!/usr/bin/env node

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
