import { DEFAULT_TERMINAL_SOURCE_REGISTRY } from "./source-registry.ts";

export type TerminalSourceCriticality = "core" | "tier_a" | "secondary" | "optional";

export type TerminalSourcePolicyEntry = {
  sourceId: string;
  label: string;
  readOnly: true;
  enabledByDefault: boolean;
  criticality: TerminalSourceCriticality;
  serverOnly: boolean;
  clientExposureAllowed: boolean;
  requiresCredential: boolean;
  requiresDeletionHandling: boolean;
  correctnessCritical: boolean;
  policyNotes: string[];
};

export type TerminalSourcePolicyCatalog = {
  readOnly: true;
  reviewComplete: boolean;
  missingInputs: string[];
  sources: TerminalSourcePolicyEntry[];
};

type Env = Record<string, string | undefined>;

const SERVER_ONLY_SOURCES = new Set([
  "sec-rss",
  "federal-reserve-rss",
  "gdelt-doc",
  "usgs-earthquakes",
  "cisa-rss",
  "ethereum-json-rpc",
  "etherscan-indexed",
  "coingecko-context",
  "fema-ipaws-rss",
  "reddit-oauth",
  "mastodon-public",
  "gnews-api",
  "mediastack-api",
  "fact-check-overlays",
]);

const CREDENTIAL_SOURCES = new Set([
  "etherscan-indexed",
  "reddit-oauth",
  "gnews-api",
  "mediastack-api",
]);

const SECONDARY_SOURCES = new Set([
  "reddit-oauth",
  "mastodon-public",
  "gnews-api",
  "mediastack-api",
  "fact-check-overlays",
]);

function truthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function criticality(sourceId: string): TerminalSourceCriticality {
  if (sourceId === "polymarket-public") return "core";
  if (SECONDARY_SOURCES.has(sourceId)) return "secondary";
  if (sourceId === "etherscan-indexed" || sourceId === "fema-ipaws-rss") return "optional";
  return "tier_a";
}

function notesFor(sourceId: string): string[] {
  const common = ["Keep source reads server-side unless the source is public Polymarket metadata."];
  switch (sourceId) {
    case "polymarket-public":
      return ["Public Gamma/CLOB/Data reads only; authenticated trading endpoints remain blocked."];
    case "sec-rss":
      return ["SEC fetching stays backend-only and must use a descriptive fair-access User-Agent."];
    case "reddit-oauth":
      return ["Optional low-trust discussion signal; deleted or removed submissions are tombstoned and must not become evidence rows."];
    case "etherscan-indexed":
      return ["Optional indexed enrichment only; correctness must come from raw JSON-RPC logs or normalized source evidence."];
    case "gnews-api":
    case "mediastack-api":
      return ["Optional commercial news recall behind flags; credentials must never be exposed to clients."];
    case "ethereum-json-rpc":
      return ["Read-only JSON-RPC methods only and bounded address/topic filters are required when enabled."];
    default:
      return common;
  }
}

export function buildTerminalBridgeSourcePolicyCatalog(
  env: Env = process.env,
): TerminalSourcePolicyCatalog {
  const reviewComplete = truthy(env.SOLVOL_SOURCE_POLICY_REVIEWED);
  return {
    readOnly: true,
    reviewComplete,
    missingInputs: reviewComplete ? [] : ["SOLVOL_SOURCE_POLICY_REVIEWED"],
    sources: DEFAULT_TERMINAL_SOURCE_REGISTRY.map((source): TerminalSourcePolicyEntry => {
      const serverOnly = SERVER_ONLY_SOURCES.has(source.sourceId);
      return {
        sourceId: source.sourceId,
        label: source.label,
        readOnly: true,
        enabledByDefault: source.enabled,
        criticality: criticality(source.sourceId),
        serverOnly,
        clientExposureAllowed: source.sourceId === "polymarket-public",
        requiresCredential: CREDENTIAL_SOURCES.has(source.sourceId),
        requiresDeletionHandling: source.sourceId === "reddit-oauth",
        correctnessCritical: !SECONDARY_SOURCES.has(source.sourceId) && source.sourceId !== "etherscan-indexed",
        policyNotes: notesFor(source.sourceId),
      };
    }),
  };
}
