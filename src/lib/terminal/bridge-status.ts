import {
  BRIDGE_FEATURE_FLAG_NAMES,
  bridgeCommandManifest,
  readBridgeFeatureFlags,
  type BridgeCommandManifestEntry,
  type BridgeFeatureFlagState,
} from "./bridge-control.ts";
import { buildTerminalBridgeCanaryHandoff, type TerminalBridgeCanaryHandoff } from "./canary-handoff.ts";
import {
  buildTerminalBridgeCompletionAudit,
  type TerminalBridgeCompletionAudit,
} from "./completion-audit.ts";
import {
  buildTerminalBridgeObservabilityCatalog,
  type TerminalBridgeObservabilityCatalog,
} from "./observability.ts";
import { buildTerminalBridgeRolloutPlan, type TerminalBridgeRolloutPlan } from "./rollout.ts";
import {
  buildTerminalBridgeSourcePolicyCatalog,
  type TerminalSourcePolicyCatalog,
} from "./source-policy.ts";
import { DEFAULT_TERMINAL_SOURCE_REGISTRY } from "./source-registry.ts";
import { TERMINAL_SYNTHETIC_SCENARIOS } from "./synthetic.ts";

type Env = Record<string, string | undefined>;

export type TerminalBridgeStatusSource = {
  sourceId: string;
  sourceClass: string;
  enabledByDefault: boolean;
  readOnly: true;
  adapterVersion: string;
};

export type TerminalBridgeStatusPayload = {
  readOnly: true;
  fetchedAt: string;
  commands: BridgeCommandManifestEntry[];
  featureFlagNames: string[];
  featureFlags: BridgeFeatureFlagState;
  sources: TerminalBridgeStatusSource[];
  backfill: {
    readOnly: true;
    marketsCommand: string;
    sourceCommand: string;
    status: "dry-run-command-ready";
  };
  replay: {
    readOnly: true;
    command: string;
    endpoint: string;
    status: "raw-payload-replay-ready";
  };
  syntheticScenarios: readonly string[];
  observability: TerminalBridgeObservabilityCatalog;
  sourcePolicy: TerminalSourcePolicyCatalog;
  rollout: TerminalBridgeRolloutPlan;
  canaryHandoff: TerminalBridgeCanaryHandoff;
  completionAudit: TerminalBridgeCompletionAudit;
};

export function buildTerminalBridgeStatusPayload({
  env = process.env,
  now = new Date().toISOString(),
}: {
  env?: Env;
  now?: string;
} = {}): TerminalBridgeStatusPayload {
  return {
    readOnly: true,
    fetchedAt: now,
    commands: bridgeCommandManifest,
    featureFlagNames: BRIDGE_FEATURE_FLAG_NAMES,
    featureFlags: readBridgeFeatureFlags(env),
    sources: DEFAULT_TERMINAL_SOURCE_REGISTRY.map((source) => ({
      sourceId: source.sourceId,
      sourceClass: source.sourceClass,
      enabledByDefault: source.enabled,
      readOnly: source.readOnly,
      adapterVersion: source.adapterVersion,
    })),
    backfill: {
      readOnly: true,
      marketsCommand: "npm run bridge:backfill:markets",
      sourceCommand: "npm run bridge:backfill:source -- --source=gdelt-doc --since=2026-05-01",
      status: "dry-run-command-ready",
    },
    replay: {
      readOnly: true,
      command: "npm run bridge:replay -- --fixture=fixtures/replay/window-001",
      endpoint: "/api/terminal/replay?rawBlobKey=<raw-blob-key>",
      status: "raw-payload-replay-ready",
    },
    syntheticScenarios: TERMINAL_SYNTHETIC_SCENARIOS,
    observability: buildTerminalBridgeObservabilityCatalog(env),
    sourcePolicy: buildTerminalBridgeSourcePolicyCatalog(env),
    rollout: buildTerminalBridgeRolloutPlan(env),
    canaryHandoff: buildTerminalBridgeCanaryHandoff(env),
    completionAudit: buildTerminalBridgeCompletionAudit(env),
  };
}
