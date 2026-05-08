import { DEFAULT_TERMINAL_SOURCE_REGISTRY } from "./source-registry.ts";

export type BridgeFeatureFlagName =
  | "bridge.cluster.v1"
  | "bridge.correlation.whyMovedV1"
  | "bridge.realtime.sse"
  | "bridge.ui.provenancePanel"
  | "bridge.social.lowTrustSources"
  | `bridge.ingest.source.${string}`;

export type BridgeFeatureFlagState = Record<BridgeFeatureFlagName, boolean>;

export type BridgeCommandManifestEntry = {
  name: string;
  description: string;
  readOnly: true;
};

export const BRIDGE_CORE_FEATURE_FLAGS: BridgeFeatureFlagName[] = [
  "bridge.cluster.v1",
  "bridge.correlation.whyMovedV1",
  "bridge.realtime.sse",
  "bridge.ui.provenancePanel",
  "bridge.social.lowTrustSources",
];

export function bridgeSourceFlagName(sourceId: string): BridgeFeatureFlagName {
  return `bridge.ingest.source.${sourceId}`;
}

export const BRIDGE_FEATURE_FLAG_NAMES: string[] = [
  ...BRIDGE_CORE_FEATURE_FLAGS,
  ...DEFAULT_TERMINAL_SOURCE_REGISTRY.map((source) => bridgeSourceFlagName(source.sourceId)),
];

export const bridgeCommandManifest: BridgeCommandManifestEntry[] = [
  {
    name: "bridge:health",
    description: "Print bridge control-plane health, feature flags, and local readiness.",
    readOnly: true,
  },
  {
    name: "bridge:backfill:markets",
    description: "Dry-run market backfill plan for public Polymarket registry reads.",
    readOnly: true,
  },
  {
    name: "bridge:backfill:source",
    description: "Dry-run source backfill plan for a flagged source adapter.",
    readOnly: true,
  },
  {
    name: "bridge:replay",
    description: "Dry-run replay command for stored raw payload windows.",
    readOnly: true,
  },
  {
    name: "bridge:inject:synthetic",
    description: "Dry-run synthetic injection scenario for QA and operator drills.",
    readOnly: true,
  },
  {
    name: "bridge:pause-source",
    description: "Dry-run source pause command for operator runbooks.",
    readOnly: true,
  },
  {
    name: "bridge:resume-source",
    description: "Dry-run source resume command for operator runbooks.",
    readOnly: true,
  },
  {
    name: "bridge:retention:plan",
    description: "Dry-run retention and downsample plan for bridge datasets.",
    readOnly: true,
  },
  {
    name: "bridge:audit",
    description: "Read-only completion audit mapping the bridge objective to artifacts, verification, and blockers.",
    readOnly: true,
  },
  {
    name: "bridge:canary:check",
    description: "Read-only production canary readiness check for mandatory infrastructure and approvals.",
    readOnly: true,
  },
  {
    name: "bridge:canary:env-template",
    description: "Read-only production canary environment template for missing infrastructure and approval inputs.",
    readOnly: true,
  },
];

export function envNameForBridgeFlag(flag: BridgeFeatureFlagName): string {
  return `SOLVOL_FLAG_${flag.replace(/[^a-zA-Z0-9]+/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

export function readBridgeFeatureFlags(
  env: Record<string, string | undefined> = process.env,
  sourceIds = DEFAULT_TERMINAL_SOURCE_REGISTRY.map((source) => source.sourceId),
): BridgeFeatureFlagState {
  const names = [
    ...BRIDGE_CORE_FEATURE_FLAGS,
    ...sourceIds.map(bridgeSourceFlagName),
  ];
  return Object.fromEntries(
    names.map((flag) => [flag, parseBoolean(env[envNameForBridgeFlag(flag)])]),
  ) as BridgeFeatureFlagState;
}
