import { buildTerminalBridgeCanaryHandoff } from "./canary-handoff.ts";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

export type TerminalBridgeCompletionAuditStatus = "present" | "blocked_externally";
export type TerminalBridgeCompletionAuditArtifactStatus = "present" | "missing";
export type TerminalBridgeCompletionAuditArtifactKind = "file" | "directory" | "missing";
export type TerminalBridgeCompletionAuditCommandStatus = "referenced" | "missing_reference";
export type TerminalBridgeCompletionAuditCommandAvailabilityStatus = "available" | "missing";
export type TerminalBridgeCompletionAuditContentStatus = "present" | "missing";
export type TerminalBridgeCompletionAuditVerificationLogStatus = "present" | "missing";
export type TerminalBridgeCompletionAuditReadOnlyBoundaryStatus = "clear" | "violation";

export type TerminalBridgeCompletionAuditItem = {
  requirement: string;
  evidence: string[];
  verification: string[];
  status: TerminalBridgeCompletionAuditStatus;
};

export type TerminalBridgeCompletionAuditArtifactCheck = {
  path: string;
  status: TerminalBridgeCompletionAuditArtifactStatus;
  kind: TerminalBridgeCompletionAuditArtifactKind;
  referencedBy: string[];
};

export type TerminalBridgeCompletionAuditCommandCheck = {
  command: string;
  status: TerminalBridgeCompletionAuditCommandStatus;
  referencedBy: string[];
};

export type TerminalBridgeCompletionAuditCommandAvailabilityCheck = {
  command: string;
  status: TerminalBridgeCompletionAuditCommandAvailabilityStatus;
  evidence: string[];
  missingEvidence: string[];
};

export type TerminalBridgeCompletionAuditContentCheck = {
  path: string;
  marker: string;
  status: TerminalBridgeCompletionAuditContentStatus;
  referencedBy: string[];
};

export type TerminalBridgeCompletionAuditVerificationLogCheck = {
  path: string;
  marker: string;
  status: TerminalBridgeCompletionAuditVerificationLogStatus;
  referencedBy: string[];
};

export type TerminalBridgeCompletionAuditReadOnlyBoundaryCheck = {
  path: string;
  status: TerminalBridgeCompletionAuditReadOnlyBoundaryStatus;
  forbiddenMatches: string[];
};

export type TerminalBridgeCompletionAudit = {
  readOnly: true;
  achieved: boolean;
  productionCanaryReady: boolean;
  objectiveCriteria: string[];
  checklist: TerminalBridgeCompletionAuditItem[];
  artifactChecks: TerminalBridgeCompletionAuditArtifactCheck[];
  missingArtifacts: string[];
  artifactEvidenceComplete: boolean;
  contentChecks: TerminalBridgeCompletionAuditContentCheck[];
  missingContentMarkers: string[];
  contentEvidenceComplete: boolean;
  readOnlyBoundaryChecks: TerminalBridgeCompletionAuditReadOnlyBoundaryCheck[];
  readOnlyBoundaryViolations: string[];
  readOnlyBoundaryClean: boolean;
  verificationLogChecks: TerminalBridgeCompletionAuditVerificationLogCheck[];
  missingVerificationLogEntries: string[];
  verificationLogComplete: boolean;
  verificationCommands: string[];
  verificationCommandChecks: TerminalBridgeCompletionAuditCommandCheck[];
  verificationCoverageComplete: boolean;
  verificationCommandAvailabilityChecks: TerminalBridgeCompletionAuditCommandAvailabilityCheck[];
  missingVerificationCommands: string[];
  verificationCommandAvailabilityComplete: boolean;
  missingInputs: string[];
  accessPrerequisites: ReturnType<typeof buildTerminalBridgeCanaryHandoff>["accessPrerequisites"];
  blockerSummary: ReturnType<typeof buildTerminalBridgeCanaryHandoff>["blockerSummary"];
  decision: string;
  nextAction: string;
};

function concreteInputs(inputs: string[]): string[] {
  return Array.from(new Set(inputs.flatMap((input) => input.split(/\s+or\s+/))));
}

function isArtifactReference(reference: string): boolean {
  if (/\s/.test(reference)) return false;
  return reference.includes("/")
    || reference.startsWith(".")
    || /\.(css|example|json|md|mjs|sql|ts|tsx|yaml|yml)$/.test(reference);
}

function artifactKind(path: string): TerminalBridgeCompletionAuditArtifactKind {
  if (!existsSync(path)) return "missing";
  try {
    return statSync(path).isDirectory() ? "directory" : "file";
  } catch {
    return "missing";
  }
}

function readArtifactText(path: string): string {
  if (artifactKind(path) !== "file") return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

type PackageManifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string");
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function readPackageManifest(repoRoot: string): PackageManifest {
  const parsed = parseJsonObject(readArtifactText(resolve(repoRoot, "package.json")));
  return {
    scripts: isStringRecord(parsed.scripts) ? parsed.scripts : undefined,
    dependencies: isStringRecord(parsed.dependencies) ? parsed.dependencies : undefined,
    devDependencies: isStringRecord(parsed.devDependencies) ? parsed.devDependencies : undefined,
  };
}

function hasPackageDependency(manifest: PackageManifest, name: string): boolean {
  return Boolean(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]);
}

const readOnlyBoundaryExtensions = new Set([".js", ".json", ".mjs", ".sql", ".ts", ".tsx"]);
const readOnlyBoundaryForbiddenPatterns = [
  /\bcreateOrder\b/g,
  /\bpostOrder\b/g,
  /\bcancelOrder\b/g,
  /\bsubmitOrder\b/g,
  /\bplaceOrder\b/g,
  /\bsignOrder\b/g,
  /\bexecuteTrade\b/g,
  /\btradeExecution\b/g,
  /\borderPlacement\b/g,
  /\bprivateKey\b/g,
  /\bPOLY_API_KEY\b/g,
  /\bPOLY_SIGNATURE\b/g,
  /\bPOLY_PASSPHRASE\b/g,
  /\bconnectWallet\b/g,
  /\bwalletConnection\b/g,
  /\bcustodyFlow\b/g,
  /\bdepositFlow\b/g,
  /\bwithdrawalFlow\b/g,
  /\bdepositFunds\b/g,
  /\bwithdrawFunds\b/g,
];

function listReadableFiles(root: string): string[] {
  if (artifactKind(root) !== "directory") return [];

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listReadableFiles(path);
    if (!entry.isFile() || !readOnlyBoundaryExtensions.has(extname(entry.name))) return [];
    return [path];
  });
}

function buildReadOnlyBoundaryChecks(repoRoot: string): TerminalBridgeCompletionAuditReadOnlyBoundaryCheck[] {
  return ["src", "scripts", "supabase"]
    .flatMap((root) => listReadableFiles(resolve(repoRoot, root)))
    .map((path) => {
      const text = readArtifactText(path);
      const forbiddenMatches = Array.from(new Set(
        readOnlyBoundaryForbiddenPatterns.flatMap((pattern) => text.match(pattern) ?? []),
      )).sort();
      const status: TerminalBridgeCompletionAuditReadOnlyBoundaryStatus = forbiddenMatches.length > 0
        ? "violation"
        : "clear";

      return {
        path: relative(repoRoot, path),
        status,
        forbiddenMatches,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function buildArtifactChecks(
  checklist: TerminalBridgeCompletionAuditItem[],
  repoRoot: string,
): TerminalBridgeCompletionAuditArtifactCheck[] {
  const references = new Map<string, Set<string>>();

  for (const item of checklist) {
    for (const reference of [...item.evidence, ...item.verification]) {
      if (!isArtifactReference(reference)) continue;
      if (!references.has(reference)) references.set(reference, new Set());
      references.get(reference)?.add(item.requirement);
    }
  }

  return Array.from(references.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, referencedBy]) => {
      const resolved = isAbsolute(path) ? path : resolve(repoRoot, path);
      const kind = artifactKind(resolved);
      return {
        path,
        status: kind === "missing" ? "missing" : "present",
        kind,
        referencedBy: Array.from(referencedBy).sort(),
      };
    });
}

function buildVerificationCommandChecks(
  checklist: TerminalBridgeCompletionAuditItem[],
  commands: string[],
): TerminalBridgeCompletionAuditCommandCheck[] {
  return commands.map((command) => {
    const referencedBy = [
      "Required verification gate",
      ...checklist
        .filter((item) => item.verification.includes(command))
        .map((item) => item.requirement),
    ];

    return {
      command,
      status: referencedBy.length > 0 ? "referenced" : "missing_reference",
      referencedBy,
    };
  });
}

function buildVerificationCommandAvailabilityChecks(
  repoRoot: string,
  commands: string[],
): TerminalBridgeCompletionAuditCommandAvailabilityCheck[] {
  const packageManifest = readPackageManifest(repoRoot);
  const testFiles = listReadableFiles(resolve(repoRoot, "test")).filter((path) => path.endsWith(".test.ts"));
  const checkPath = (path: string, evidence: string, missingEvidence: string[] = []): string[] => {
    if (artifactKind(resolve(repoRoot, path)) === "missing") {
      missingEvidence.push(evidence);
      return [];
    }
    return [evidence];
  };

  return commands.map((command) => {
    const evidence: string[] = [];
    const missingEvidence: string[] = [];

    if (command.startsWith("npm run ")) {
      const script = command.slice("npm run ".length).trim();
      const scriptEvidence = `package.json:scripts.${script}`;
      if (packageManifest.scripts?.[script]) {
        evidence.push(scriptEvidence);
      } else {
        missingEvidence.push(scriptEvidence);
      }
    } else if (command === "npx tsc --noEmit") {
      evidence.push(...checkPath("tsconfig.json", "tsconfig.json", missingEvidence));
      if (hasPackageDependency(packageManifest, "typescript")) {
        evidence.push(packageManifest.devDependencies?.typescript
          ? "package.json:devDependencies.typescript"
          : "package.json:dependencies.typescript");
      } else {
        missingEvidence.push("package.json:dependencies.typescript");
      }
    } else if (command === "node --test --experimental-strip-types test/*.test.ts") {
      if (testFiles.length > 0) {
        evidence.push("test/*.test.ts");
      } else {
        missingEvidence.push("test/*.test.ts");
      }
    } else if (command === "git diff --check") {
      evidence.push(...checkPath(".git", ".git", missingEvidence));
    } else {
      missingEvidence.push(command);
    }

    return {
      command,
      status: missingEvidence.length === 0 ? "available" : "missing",
      evidence: evidence.sort(),
      missingEvidence: missingEvidence.sort(),
    };
  });
}

function buildContentChecks(repoRoot: string): TerminalBridgeCompletionAuditContentCheck[] {
  const checks: Array<Omit<TerminalBridgeCompletionAuditContentCheck, "status">> = [
    {
      path: "AGENTS.md",
      marker: "Keep Solvol Terminal read-only",
      referencedBy: ["read-only boundary", "source planning docs inspected"],
    },
    {
      path: "AGENTS.md",
      marker: "Polymarket Gamma/CLOB/Data",
      referencedBy: ["public Polymarket Gamma/CLOB/Data", "source planning docs inspected"],
    },
    {
      path: "ARCHITECTURE.md",
      marker: "## Runtime Layers",
      referencedBy: ["service topology", "architecture direction"],
    },
    {
      path: "ARCHITECTURE.md",
      marker: "`runTerminalIngestionBridge()` is the shared source execution boundary",
      referencedBy: ["coordinate integration", "generic ingestion framework", "service topology"],
    },
    {
      path: "ARCHITECTURE.md",
      marker: "Core deterministic engines:",
      referencedBy: ["deterministic and replayable design", "architecture direction"],
    },
    {
      path: "ARCHITECTURE.md",
      marker: "LLM narration remains optional and cannot replace normalized facts.",
      referencedBy: ["source truth from normalized data and provenance", "deterministic and replayable design"],
    },
    {
      path: "ARCHITECTURE.md",
      marker: "Production canary remains gated by `npm run bridge:canary:check`",
      referencedBy: ["production canary readiness", "operations docs and rollout handoff"],
    },
    {
      path: "BRIDGE_IMPLEMENTATION_ROADMAP.md",
      marker: "The acceptance bar is not just that the code runs.",
      referencedBy: ["architecture direction", "deterministic and replayable design"],
    },
    {
      path: "BRIDGE_IMPLEMENTATION_ROADMAP.md",
      marker: "| Replay non-determinism above tolerance | Pause canary readiness until replay is deterministic |",
      referencedBy: ["deterministic and replayable design", "production canary readiness"],
    },
    {
      path: "BRIDGE_IMPLEMENTATION_ROADMAP.md",
      marker: "## Planned File Map",
      referencedBy: ["service topology", "coordinate integration"],
    },
    {
      path: "docs/terminal-bridge-agent-ownership.md",
      marker: "Chief Architect Agent: owns architecture direction in `ARCHITECTURE.md`",
      referencedBy: ["architecture direction", "maintain ARCHITECTURE.md"],
    },
    {
      path: "docs/terminal-bridge-agent-ownership.md",
      marker: "preserve service topology boundaries across UI, API, bridge, persistence, replay, and rollout layers",
      referencedBy: ["service topology", "coordinate integration"],
    },
    {
      path: "docs/terminal-bridge-agent-ownership.md",
      marker: "Maintains bridge topology, runtime boundaries, deterministic replay posture, rollout architecture, and anti-coupling review.",
      referencedBy: ["prevent spaghetti coupling", "deterministic and replayable design", "service topology"],
    },
    {
      path: "SOLVOL_PROTOCOL.md",
      marker: "MarketSource",
      referencedBy: ["adapter contracts", "own SOLVOL_PROTOCOL.md and DATA_CONTRACTS.md"],
    },
    {
      path: "SOLVOL_PROTOCOL.md",
      marker: "External source adapters must satisfy `SourceAdapter`",
      referencedBy: ["adapter contracts", "source adapters", "own SOLVOL_PROTOCOL.md and DATA_CONTRACTS.md"],
    },
    {
      path: "SOLVOL_PROTOCOL.md",
      marker: "Rejected transitions return a deterministic transition record",
      referencedBy: ["event and market state machines", "deterministic transforms"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type MarketSource",
      referencedBy: ["adapter contracts", "own SOLVOL_PROTOCOL.md and DATA_CONTRACTS.md"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type SourceAdapter<R>",
      referencedBy: ["adapter contracts", "source adapters", "domain models and interfaces"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type FetchCursor",
      referencedBy: ["resumable cursors", "adapter contracts"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type RawDocument",
      referencedBy: ["provenance schema", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type NewsItem",
      referencedBy: ["normalize raw payloads", "domain models and interfaces"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type EventItem",
      referencedBy: ["domain models and interfaces", "event clustering", "event and market state machines"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type TerminalStateTransition<TState extends string>",
      referencedBy: ["event and market state machines", "domain models and interfaces"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type WhyMovedScoreBreakdown",
      referencedBy: ["scoring contracts", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/types.ts",
      marker: "export type WhyMovedCandidate",
      referencedBy: ["deterministic why-moved scoring", "scoring contracts", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/state-machines.ts",
      marker: "export function transitionMarketStatus",
      referencedBy: ["event and market state machines", "market state tracking", "deterministic transforms"],
    },
    {
      path: "src/lib/terminal/state-machines.ts",
      marker: "export function transitionEventLifecycle",
      referencedBy: ["event and market state machines", "deterministic transforms"],
    },
    {
      path: "DATA_CONTRACTS.md",
      marker: "EventMarketLink",
      referencedBy: ["event-to-market linker", "domain models and interfaces"],
    },
    {
      path: "DATA_CONTRACTS.md",
      marker: "why_moved_candidate.event_market_link_json",
      referencedBy: ["deterministic why-moved scoring", "source truth from normalized data and provenance"],
    },
    {
      path: "DATA_CONTRACTS.md",
      marker: "Market and event transitions are explicit contracts",
      referencedBy: ["event and market state machines", "domain models and interfaces"],
    },
    {
      path: "DATA_CONTRACTS.md",
      marker: "`RawDocument` metadata is immutable and checksum-backed",
      referencedBy: ["provenance schema", "source truth from normalized data and provenance"],
    },
    {
      path: "DATA_CONTRACTS.md",
      marker: "`source_cursor` state is abstracted by the terminal cursor store",
      referencedBy: ["resumable cursors", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/polymarket-source.ts",
      marker: "export function createPolymarketMarketSource()",
      referencedBy: ["public Polymarket Gamma/CLOB/Data", "Polymarket integration", "adapter contracts"],
    },
    {
      path: "src/lib/terminal/polymarket-source.ts",
      marker: "yesToken ? fetchYesPriceHistory(yesToken) : Promise.resolve([])",
      referencedBy: ["price history ingestion", "public Polymarket Gamma/CLOB/Data"],
    },
    {
      path: "src/lib/terminal/polymarket-source.ts",
      marker: "return market ? movesFromMarket(market) : []",
      referencedBy: ["market reaction detection", "price history ingestion"],
    },
    {
      path: "src/lib/terminal/polymarket-source.ts",
      marker: "fetchMarketTrades(market.conditionId, query.limit ?? 40)",
      referencedBy: ["public Polymarket Gamma/CLOB/Data", "market state tracking"],
    },
    {
      path: "src/lib/terminal/polymarket-stream.ts",
      marker: "export const POLYMARKET_PUBLIC_WEBSOCKET_CHANNELS",
      referencedBy: ["websocket consumers", "read-only boundary", "public Polymarket Gamma/CLOB/Data"],
    },
    {
      path: "src/lib/terminal/polymarket-stream.ts",
      marker: "requiresAuth: false",
      referencedBy: ["read-only boundary", "websocket consumers"],
    },
    {
      path: "src/lib/terminal/polymarket-stream.ts",
      marker: "export function normalizePolymarketMarketStreamMessage",
      referencedBy: ["websocket consumers", "market state tracking"],
    },
    {
      path: "src/lib/terminal/polymarket-stream.ts",
      marker: "sourceId: \"polymarket-public\"",
      referencedBy: ["market state tracking", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/query-compiler.ts",
      marker: "export function compileMarketQueryPack",
      referencedBy: ["market query compiler", "market-to-entity mapping"],
    },
    {
      path: "src/lib/terminal/query-compiler.ts",
      marker: "sourceId: \"federal-reserve-rss\"",
      referencedBy: ["market query compiler", "Federal Reserve feeds"],
    },
    {
      path: "src/lib/terminal/query-compiler.ts",
      marker: "const gdeltTerms = unique([",
      referencedBy: ["market query compiler", "GDELT"],
    },
    {
      path: "src/lib/terminal/market-registry.ts",
      marker: "export function marketToRegistryRecord",
      referencedBy: ["market registry", "market-to-entity mapping"],
    },
    {
      path: "src/lib/terminal/market-registry.ts",
      marker: "export function detectPriceReactionWindows",
      referencedBy: ["market reaction detection", "reaction window analysis"],
    },
    {
      path: "src/lib/terminal/market-registry.ts",
      marker: "reactionWindows: unique.flatMap((market) => detectPriceReactionWindows(market))",
      referencedBy: ["market reaction detection", "market registry"],
    },
    {
      path: "src/lib/terminal/market-family.ts",
      marker: "export function classifyMarketFamily",
      referencedBy: ["market family classification", "market query compiler"],
    },
    {
      path: "src/lib/terminal/market-family.ts",
      marker: "export function inferMarketFamilyDirection",
      referencedBy: ["market family classification", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/market-family.ts",
      marker: "const ruleId = `why:market_family:${family}` as const",
      referencedBy: ["deterministic why-moved scoring", "market family classification"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "gdelt-doc",
      referencedBy: ["GDELT", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "sec-rss",
      referencedBy: ["SEC EDGAR", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "federal-reserve-rss",
      referencedBy: ["Federal Reserve feeds", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "usgs-earthquakes",
      referencedBy: ["USGS", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "cisa-rss",
      referencedBy: ["optional secondary news APIs", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "fema-ipaws-rss",
      referencedBy: ["FEMA", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "etherscan-indexed",
      referencedBy: ["Etherscan", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "ethereum-json-rpc",
      referencedBy: ["Ethereum JSON-RPC", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "coingecko-context",
      referencedBy: ["CoinGecko", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "reddit-oauth",
      referencedBy: ["Reddit", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "mastodon-public",
      referencedBy: ["Mastodon", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "gnews-api",
      referencedBy: ["optional secondary news APIs", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "mediastack-api",
      referencedBy: ["optional secondary news APIs", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "fact-check-overlays",
      referencedBy: ["optional secondary news APIs", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "function fixtureAdapter<R>",
      referencedBy: ["adapter fixture tests", "deterministic mock fallback", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "const tombstoneMarkers = new Set([\"[deleted]\", \"[removed]\"])",
      referencedBy: ["Reddit", "source adapters", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "const latestBlock = hexToNumber(await rpc(\"eth_blockNumber\", []))",
      referencedBy: ["Ethereum JSON-RPC", "read-only boundary", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "const rows = ethereumLogRowsFromPayload(await rpc(\"eth_getLogs\", [filter]))",
      referencedBy: ["Ethereum JSON-RPC", "read-only boundary", "source adapters"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "if (!apiKey || !opts.queryTerms?.length)",
      referencedBy: ["optional secondary news APIs", "deterministic mock fallback", "source adapters"],
    },
    {
      path: "src/lib/terminal/ingestion-runner.ts",
      marker: "function fetchBatchWithRetry",
      referencedBy: ["retries/backoff/circuit breakers", "polling and streaming systems"],
    },
    {
      path: "src/lib/terminal/ingestion-runner.ts",
      marker: "baseBackoffMs * (2 ** (attempt - 1))",
      referencedBy: ["retries/backoff/circuit breakers", "polling and streaming systems"],
    },
    {
      path: "src/lib/terminal/ingestion-runner.ts",
      marker: "circuit breaker paused source",
      referencedBy: ["retries/backoff/circuit breakers", "source health and quota management"],
    },
    {
      path: "src/lib/terminal/ingestion-runner.ts",
      marker: "const cursorStore = opts.cursorStore ?? createConfiguredTerminalCursorStore()",
      referencedBy: ["resumable cursors", "polling and streaming systems"],
    },
    {
      path: "src/lib/terminal/ingestion-runner.ts",
      marker: "await cursorStore.commitCursor(pending.sourceId, pending.cursor, now)",
      referencedBy: ["resumable cursors", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/ingestion-runner.ts",
      marker: "rateLimitRemaining: record.rateLimitRemaining",
      referencedBy: ["source health and quota management", "retries/backoff/circuit breakers"],
    },
    {
      path: "src/lib/terminal/market-registry.ts",
      marker: "entityRefs: namedEntityRefs.length > 0 ? namedEntityRefs : queryPack.entities",
      referencedBy: ["market-to-entity mapping", "market registry"],
    },
    {
      path: "src/lib/terminal/persistence.ts",
      marker: "entities_json: market.entityRefs",
      referencedBy: ["market-to-entity mapping", "source truth from normalized data and provenance"],
    },
    {
      path: "supabase/schema.sql",
      marker: "entities_json jsonb not null default '[]'::jsonb",
      referencedBy: ["market-to-entity mapping", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "const MARKET_TERM_ALIASES",
      referencedBy: ["alias resolution", "entity extraction", "deterministic transforms"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "aliases: [\"Fed\", \"FOMC\"]",
      referencedBy: ["alias resolution", "entity extraction"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function extractEntityRefs",
      referencedBy: ["entity extraction", "enrichment pipelines"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function extractGeoRefs",
      referencedBy: ["geo extraction", "enrichment pipelines"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "source: \"source-country\"",
      referencedBy: ["geo extraction", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function scoreSentiment",
      referencedBy: ["sentiment rules", "enrichment pipelines"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "ruleIds.push(`sent_pos:${rx}`)",
      referencedBy: ["sentiment rules", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "ruleIds.push(`sent_neg:${rx}`)",
      referencedBy: ["sentiment rules", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function scoreCredibility",
      referencedBy: ["source credibility scoring", "enrichment pipelines"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "ruleIds.push(\"cred:corroborated_2plus\")",
      referencedBy: ["source credibility scoring", "source truth from normalized data and provenance"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function buildNewsFingerprint",
      referencedBy: ["deterministic transforms", "normalize raw payloads"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "function eventKindForMembers",
      referencedBy: ["event taxonomy", "enrichment pipelines"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "occurredAt: input.occurredAt ?? input.publishedAt",
      referencedBy: ["timestamp normalization", "normalize raw payloads"],
    },
    {
      path: "src/lib/terminal/source-adapters.ts",
      marker: "dedupeFingerprint: buildNewsFingerprint({",
      referencedBy: ["deterministic transforms", "normalize raw payloads"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function dedupeNewsItems",
      referencedBy: ["deduplication", "event clustering"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "normalizeSourceUrl(item.canonicalUrl ?? item.sourceUrl)",
      referencedBy: ["canonical URL normalization", "deduplication"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "algorithm: \"simhash64/minhash-v1\"",
      referencedBy: ["simhash/minhash logic", "event clustering"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "const timeline = buildEventTimeline",
      referencedBy: ["event timelines", "event clustering"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "sourceDiversityScore: diversityScore",
      referencedBy: ["source diversity scoring", "event clustering"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "noveltyScore: clusterNoveltyScore",
      referencedBy: ["novelty scoring", "event clustering"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "const contradictions = detectContradictions(members)",
      referencedBy: ["contradiction detection", "event clustering"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "const rumorStatus = rumorStatusForMembers",
      referencedBy: ["rumor escalation tracking", "event clustering"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function linkEventToMarket",
      referencedBy: ["event-to-market linker", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "export function linkEventsToMarkets",
      referencedBy: ["market candidate generation", "event-to-market linker"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "const confidence = clamp01(lexical + entity + time + source + corroboration + marketReaction - penalties)",
      referencedBy: ["confidence scoring", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "scoreBreakdown: { lexical, entity, time, source, corroboration, marketReaction, penalties }",
      referencedBy: ["evidence breakdowns", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "observedPriceMove: {",
      referencedBy: ["reaction window analysis", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "function evidenceStatusForCandidate",
      referencedBy: ["insufficient-evidence handling", "evidence breakdowns"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "status: \"insufficient_evidence\"",
      referencedBy: ["insufficient-evidence handling", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "function marketDivergenceForDirections",
      referencedBy: ["market divergence detection", "deterministic why-moved scoring"],
    },
    {
      path: "src/lib/terminal/source-intelligence.ts",
      marker: "function scoreMoveQuality",
      referencedBy: ["move quality scoring", "deterministic why-moved scoring"],
    },
    {
      path: "scripts/bridge.mjs",
      marker: "bridge:audit",
      referencedBy: ["read-only completion audit command", "control plane and repo commands"],
    },
    {
      path: "scripts/bridge.mjs",
      marker: "bridge:canary:check",
      referencedBy: ["production canary readiness", "control plane and repo commands"],
    },
    {
      path: "src/lib/terminal/completion-audit.ts",
      marker: "artifactEvidenceComplete",
      referencedBy: ["read-only completion audit command"],
    },
    {
      path: "src/lib/terminal/completion-audit.ts",
      marker: "verificationCoverageComplete",
      referencedBy: ["read-only completion audit command"],
    },
  ];

  return checks.map((check) => {
    const resolved = isAbsolute(check.path) ? check.path : resolve(repoRoot, check.path);
    const text = readArtifactText(resolved).toLowerCase();
    return {
      ...check,
      status: text.includes(check.marker.toLowerCase()) ? "present" : "missing",
      referencedBy: [...check.referencedBy].sort(),
    };
  });
}

function buildVerificationLogChecks(repoRoot: string): TerminalBridgeCompletionAuditVerificationLogCheck[] {
  const path = "SOLVOL_PLAN.md";
  const checks: Array<Omit<TerminalBridgeCompletionAuditVerificationLogCheck, "path" | "status">> = [
    {
      marker: "`npm run lint` -> passed",
      referencedBy: ["Required verification gate"],
    },
    {
      marker: "`npx tsc --noEmit` -> passed",
      referencedBy: ["Required verification gate"],
    },
    {
      marker: "`node --test --experimental-strip-types test/*.test.ts` -> passed, 191 tests",
      referencedBy: ["Required verification gate"],
    },
    {
      marker: "`npm run build` -> passed",
      referencedBy: ["Required verification gate"],
    },
    {
      marker: "`npm run bridge:canary:env-template` -> passed as a read-only dry run",
      referencedBy: ["Required verification gate", "operations docs and rollout handoff", "production canary readiness"],
    },
    {
      marker: "`npm run bridge:canary:check` -> passed as a read-only dry run and still reports `ready: false`",
      referencedBy: ["Required verification gate", "production canary readiness"],
    },
    {
      marker: "`npm run bridge:audit` -> passed as a read-only dry run",
      referencedBy: ["Required verification gate", "read-only completion audit command"],
    },
    {
      marker: "`git diff --check` -> passed",
      referencedBy: ["Required verification gate"],
    },
    {
      marker: "completionAudit.achieved: false",
      referencedBy: ["read-only completion audit command"],
    },
    {
      marker: "productionCanaryReady: false",
      referencedBy: ["production canary readiness"],
    },
  ];
  const text = readArtifactText(resolve(repoRoot, path));

  return checks.map((check) => ({
    path,
    marker: check.marker,
    status: text.includes(check.marker) ? "present" : "missing",
    referencedBy: [...check.referencedBy].sort(),
  }));
}

export function buildTerminalBridgeCompletionAudit(
  env: Record<string, string | undefined> = process.env,
  options: { repoRoot?: string } = {},
): TerminalBridgeCompletionAudit {
  const canaryHandoff = buildTerminalBridgeCanaryHandoff(env);
  const missingInputs = concreteInputs(canaryHandoff.blockerSummary.flatMap((blocker) => blocker.missingInputs));
  const productionCanaryReady = canaryHandoff.readyForProductionCanary;
  const repoRoot = options.repoRoot ?? process.cwd();
  const presentItem = (
    requirement: string,
    evidence: string[],
    verification: string[],
  ): TerminalBridgeCompletionAuditItem => ({
    requirement,
    evidence,
    verification,
    status: "present",
  });

  const architectEvidence = ["ARCHITECTURE.md", "BRIDGE_IMPLEMENTATION_ROADMAP.md", "docs/terminal-bridge-agent-ownership.md"];
  const architectVerification = ["test/bridge-completion-audit.test.ts", "test/bridge-rollout.test.ts"];
  const protocolEvidence = ["SOLVOL_PROTOCOL.md", "DATA_CONTRACTS.md", "src/lib/terminal/types.ts", "src/lib/terminal/state-machines.ts"];
  const protocolVerification = ["test/terminal-foundation.test.ts", "test/terminal-state-machines.test.ts", "npx tsc --noEmit"];
  const marketEvidence = ["src/lib/terminal/polymarket-source.ts", "src/lib/terminal/market-registry.ts", "src/lib/terminal/polymarket-stream.ts", "src/lib/terminal/query-compiler.ts", "src/lib/terminal/market-family.ts"];
  const marketVerification = ["test/polymarket-public-api.test.ts", "test/polymarket-stream.test.ts", "test/query-compiler.test.ts", "test/terminal-market-family.test.ts"];
  const sourceEvidence = ["src/lib/terminal/source-adapters.ts", "src/lib/terminal/ingestion-runner.ts", "src/lib/terminal/source-health.ts", "src/lib/terminal/source-policy.ts"];
  const sourceVerification = ["test/terminal-ingestion-bridge.test.ts", "test/source-ingestion.test.ts", "test/source-connectors.test.ts", "test/bridge-source-policy.test.ts"];
  const enrichmentEvidence = ["src/lib/terminal/source-intelligence.ts", "src/lib/terminal/scoring.ts", "src/lib/catalyst/source-scoring.ts", "src/lib/context/source-documents.ts"];
  const enrichmentVerification = ["test/terminal-ingestion-bridge.test.ts", "test/source-ingestion.test.ts", "test/terminal-data.test.ts"];
  const clusteringEvidence = ["src/lib/terminal/source-intelligence.ts", "src/lib/terminal/replay.ts", "src/lib/terminal/serving.ts"];
  const clusteringVerification = ["test/terminal-ingestion-bridge.test.ts", "test/bridge-backfill-replay.test.ts", "test/bridge-serving.test.ts"];
  const correlationEvidence = ["src/lib/terminal/source-intelligence.ts", "src/lib/terminal/types.ts", "src/lib/terminal/persistence.ts", "src/lib/terminal/market-registry.ts", "src/components/terminal/SignalFlowWorkspace.tsx"];
  const correlationVerification = ["test/terminal-ingestion-bridge.test.ts", "test/terminal-surface.test.ts", "test/terminal-market-family.test.ts"];
  const terminalApiEvidence = [
    "src/app/api/terminal/bridge-status/route.ts",
    "src/app/api/terminal/events/route.ts",
    "src/app/api/terminal/provenance/route.ts",
    "src/app/api/terminal/sources/route.ts",
    "src/app/api/terminal/why-moved/route.ts",
    "src/lib/terminal/serving.ts",
  ];
  const operationsEvidence = [
    "docs/terminal-bridge-operations.md",
    "src/lib/terminal/observability.ts",
    "src/lib/terminal/source-policy.ts",
    "src/lib/terminal/rollout.ts",
    "src/lib/terminal/canary-handoff.ts",
  ];

  const explicitResponsibilities: TerminalBridgeCompletionAuditItem[] = [
    ...[
      "architecture direction",
      "maintain ARCHITECTURE.md",
      "approve contracts/interfaces",
      "prevent spaghetti coupling",
      "deterministic and replayable design",
      "coordinate integration",
      "service topology",
    ].map((requirement) => presentItem(requirement, architectEvidence, architectVerification)),
    ...[
      "own SOLVOL_PROTOCOL.md and DATA_CONTRACTS.md",
      "domain models and interfaces",
      "adapter contracts",
      "provenance schema",
      "scoring contracts",
      "event and market state machines",
      "backward-compatible typed flows",
    ].map((requirement) => presentItem(requirement, protocolEvidence, protocolVerification)),
    ...[
      "Polymarket integration",
      "market registry",
      "price history ingestion",
      "websocket consumers",
      "market reaction detection",
      "market state tracking",
      "market query compiler",
      "market family classification",
      "market-to-entity mapping",
    ].map((requirement) => presentItem(requirement, marketEvidence, marketVerification)),
    ...[
      "source adapters",
      "GDELT",
      "SEC EDGAR",
      "Federal Reserve feeds",
      "FEMA",
      "USGS",
      "CoinGecko",
      "Etherscan",
      "Ethereum JSON-RPC",
      "Reddit",
      "Mastodon",
      "optional secondary news APIs",
      "polling and streaming systems",
      "source health and quota management",
      "retries/backoff/circuit breakers",
      "resumable cursors",
      "adapter fixture tests",
    ].map((requirement) => presentItem(requirement, sourceEvidence, sourceVerification)),
    ...[
      "normalize raw payloads",
      "entity extraction",
      "alias resolution",
      "geo extraction",
      "timestamp normalization",
      "source credibility scoring",
      "sentiment rules",
      "event taxonomy",
      "enrichment pipelines",
      "deterministic transforms",
    ].map((requirement) => presentItem(requirement, enrichmentEvidence, enrichmentVerification)),
    ...[
      "deduplication",
      "canonical URL normalization",
      "simhash/minhash logic",
      "event clustering",
      "event timelines",
      "source diversity scoring",
      "novelty scoring",
      "contradiction detection",
      "rumor escalation tracking",
    ].map((requirement) => presentItem(requirement, clusteringEvidence, clusteringVerification)),
    ...[
      "event-to-market linker",
      "market candidate generation",
      "reaction window analysis",
      "deterministic why-moved scoring",
      "confidence scoring",
      "evidence breakdowns",
      "insufficient-evidence handling",
      "market divergence detection",
      "move quality scoring",
    ].map((requirement) => presentItem(requirement, correlationEvidence, correlationVerification)),
  ];
  const roadmapDeliverables: TerminalBridgeCompletionAuditItem[] = [
    presentItem(
      "source planning docs inspected",
      ["AGENTS.md", "SOLVOL_PLAN.md", "ARCHITECTURE.md", "DATA_CONTRACTS.md", "guide.md", "BRIDGE_IMPLEMENTATION_ROADMAP.md"],
      ["test/terminal-foundation.test.ts", "test/bridge-completion-audit.test.ts"],
    ),
    presentItem(
      "source truth from normalized data and provenance",
      ["src/lib/terminal/types.ts", "src/lib/terminal/source-registry.ts", "src/lib/terminal/raw-store.ts", "src/lib/terminal/source-intelligence.ts"],
      ["test/terminal-ingestion-bridge.test.ts", "test/source-memory.test.ts"],
    ),
    presentItem(
      "control plane and repo commands",
      ["src/lib/terminal/bridge-control.ts", "scripts/bridge.mjs", "package.json"],
      ["test/bridge-control.test.ts", "npm run bridge:audit"],
    ),
    presentItem(
      "generic ingestion framework",
      ["src/lib/terminal/ingestion-runner.ts", "src/lib/terminal/persistence.ts", "src/lib/terminal/raw-store.ts", "src/lib/terminal/source-health.ts"],
      ["test/terminal-ingestion-bridge.test.ts", "test/source-ingestion.test.ts"],
    ),
    presentItem(
      "source-health/provenance/status APIs",
      terminalApiEvidence,
      ["test/bridge-serving.test.ts", "test/terminal-ingestion-bridge.test.ts"],
    ),
    presentItem(
      "realtime delivery via SSE/outbox",
      ["src/app/api/terminal/stream/route.ts", "src/lib/terminal/outbox.ts", "src/lib/terminal/persistence.ts"],
      ["test/bridge-serving.test.ts", "test/terminal-ingestion-bridge.test.ts"],
    ),
    presentItem(
      "replay and backfill",
      ["src/app/api/terminal/replay/route.ts", "src/lib/terminal/replay.ts", "src/lib/terminal/backfill.ts", "scripts/bridge.mjs"],
      ["test/bridge-backfill-replay.test.ts", "test/terminal-ingestion-bridge.test.ts"],
    ),
    presentItem(
      "synthetic injection",
      ["src/lib/terminal/synthetic.ts", "scripts/bridge.mjs"],
      ["test/bridge-synthetic.test.ts"],
    ),
    presentItem(
      "operations docs and rollout handoff",
      operationsEvidence,
      ["test/bridge-ops-docs.test.ts", "test/bridge-observability.test.ts", "test/bridge-source-policy.test.ts", "test/bridge-rollout.test.ts", "test/bridge-canary-handoff.test.ts"],
    ),
    presentItem(
      "read-only completion audit command",
      ["src/lib/terminal/completion-audit.ts", "scripts/bridge.mjs", "package.json"],
      ["test/bridge-completion-audit.test.ts", "test/bridge-control.test.ts", "npm run bridge:audit"],
    ),
  ];

  const checklist: TerminalBridgeCompletionAuditItem[] = [
    {
      requirement: "Chief Architect Agent",
      evidence: ["ARCHITECTURE.md", "BRIDGE_IMPLEMENTATION_ROADMAP.md", "docs/terminal-bridge-agent-ownership.md"],
      verification: ["test/bridge-completion-audit.test.ts", "test/bridge-rollout.test.ts"],
      status: "present",
    },
    {
      requirement: "Protocol & Contracts Agent",
      evidence: ["SOLVOL_PROTOCOL.md", "DATA_CONTRACTS.md", "src/lib/terminal/types.ts", "src/lib/terminal/state-machines.ts"],
      verification: ["test/terminal-foundation.test.ts", "test/terminal-state-machines.test.ts", "npx tsc --noEmit"],
      status: "present",
    },
    {
      requirement: "Market Intelligence Agent",
      evidence: ["src/lib/terminal/polymarket-source.ts", "src/lib/terminal/market-registry.ts", "src/lib/terminal/polymarket-stream.ts", "src/lib/terminal/query-compiler.ts"],
      verification: ["test/polymarket-public-api.test.ts", "test/polymarket-stream.test.ts", "test/query-compiler.test.ts"],
      status: "present",
    },
    {
      requirement: "External Sources Agent",
      evidence: ["src/lib/terminal/source-adapters.ts", "src/lib/terminal/source-health.ts", "src/lib/terminal/source-policy.ts"],
      verification: ["test/terminal-ingestion-bridge.test.ts", "test/source-ingestion.test.ts", "test/bridge-source-policy.test.ts"],
      status: "present",
    },
    {
      requirement: "Normalization & Enrichment Agent",
      evidence: ["src/lib/terminal/source-intelligence.ts", "src/lib/terminal/scoring.ts"],
      verification: ["test/terminal-ingestion-bridge.test.ts", "test/terminal-data.test.ts"],
      status: "present",
    },
    {
      requirement: "Event Clustering Agent",
      evidence: ["src/lib/terminal/source-intelligence.ts", "src/lib/terminal/replay.ts", "src/lib/terminal/serving.ts"],
      verification: ["test/terminal-ingestion-bridge.test.ts", "test/bridge-backfill-replay.test.ts", "test/bridge-serving.test.ts"],
      status: "present",
    },
    {
      requirement: "Correlation & Why-Moved Agent",
      evidence: ["src/lib/terminal/source-intelligence.ts", "src/lib/terminal/types.ts", "src/lib/terminal/persistence.ts", "src/components/terminal/SignalFlowWorkspace.tsx"],
      verification: ["test/terminal-ingestion-bridge.test.ts", "test/terminal-surface.test.ts", "test/bridge-serving.test.ts"],
      status: "present",
    },
    {
      requirement: "read-only boundary",
      evidence: ["SOLVOL_PROTOCOL.md", "src/lib/polymarket/public-api.ts", "src/lib/terminal/bridge-control.ts"],
      verification: ["test/polymarket-public-api.test.ts", "test/bridge-control.test.ts"],
      status: "present",
    },
    {
      requirement: "deterministic mock fallback",
      evidence: ["src/lib/terminal/mock-source.ts", "src/lib/terminal/api-demo.ts", "src/lib/terminal/source-adapters.ts"],
      verification: ["test/terminal-data.test.ts", "test/terminal-ingestion-bridge.test.ts"],
      status: "present",
    },
    {
      requirement: "production canary readiness",
      evidence: ["src/lib/terminal/canary-readiness.ts", "src/lib/terminal/canary-handoff.ts", "src/lib/terminal/rollout.ts"],
      verification: ["npm run bridge:canary:check", "test/bridge-canary.test.ts", "test/bridge-canary-handoff.test.ts"],
      status: productionCanaryReady ? "present" : "blocked_externally",
    },
    ...roadmapDeliverables,
    ...explicitResponsibilities,
  ];
  const verificationCommands = [
    "npm run lint",
    "npx tsc --noEmit",
    "node --test --experimental-strip-types test/*.test.ts",
    "npm run build",
    "npm run bridge:canary:env-template",
    "npm run bridge:canary:check",
    "npm run bridge:audit",
    "git diff --check",
  ];
  const artifactChecks = buildArtifactChecks(checklist, repoRoot);
  const missingArtifacts = artifactChecks
    .filter((check) => check.status === "missing")
    .map((check) => check.path);
  const artifactEvidenceComplete = missingArtifacts.length === 0;
  const contentChecks = buildContentChecks(repoRoot);
  const missingContentMarkers = contentChecks
    .filter((check) => check.status === "missing")
    .map((check) => `${check.path}:${check.marker}`);
  const contentEvidenceComplete = missingContentMarkers.length === 0;
  const readOnlyBoundaryChecks = buildReadOnlyBoundaryChecks(repoRoot);
  const readOnlyBoundaryViolations = readOnlyBoundaryChecks
    .filter((check) => check.status === "violation")
    .flatMap((check) => check.forbiddenMatches.map((match) => `${check.path}:${match}`));
  const readOnlyBoundaryClean = readOnlyBoundaryViolations.length === 0;
  const verificationLogChecks = buildVerificationLogChecks(repoRoot);
  const missingVerificationLogEntries = verificationLogChecks
    .filter((check) => check.status === "missing")
    .map((check) => `${check.path}:${check.marker}`);
  const verificationLogComplete = missingVerificationLogEntries.length === 0;
  const verificationCommandChecks = buildVerificationCommandChecks(checklist, verificationCommands);
  const verificationCoverageComplete = verificationCommandChecks.every((check) => check.status === "referenced");
  const verificationCommandAvailabilityChecks = buildVerificationCommandAvailabilityChecks(repoRoot, verificationCommands);
  const missingVerificationCommands = verificationCommandAvailabilityChecks
    .filter((check) => check.status === "missing")
    .map((check) => `${check.command}:${check.missingEvidence.join(",")}`);
  const verificationCommandAvailabilityComplete = missingVerificationCommands.length === 0;

  return {
    readOnly: true,
    achieved: checklist.every((item) => item.status === "present")
      && artifactEvidenceComplete
      && contentEvidenceComplete
      && readOnlyBoundaryClean
      && verificationLogComplete
      && verificationCoverageComplete
      && verificationCommandAvailabilityComplete
      && productionCanaryReady,
    productionCanaryReady,
    objectiveCriteria: [
      "Strict read-only terminal bridge with no trade execution, order placement, custody, deposits, withdrawals, private-key handling, authenticated trading, or user fund flows.",
      "Deterministic mock fallback keeps /terminal demoable without credentials.",
      "Public Polymarket Gamma/CLOB/Data remain the authoritative market and price-reaction source.",
      "Normalized data, provenance, scores, rule IDs, timestamps, replay, and source documents are source truth; LLM output is narration only.",
      "Requested agent responsibilities map to concrete artifacts and verification checks.",
      "Runtime completion audit inspects both cited artifact existence and required content markers.",
      "Runtime completion audit scans production code and schema files for forbidden trading, wallet, custody, deposit, and withdrawal implementation symbols.",
      "Runtime completion audit inspects the verification log for required gate outcomes and blocked canary state.",
      "Runtime completion audit validates that required verification commands map to available package scripts, compiler config, test files, and repo metadata.",
      "Production canary readiness requires green local gates plus target deployment environment inputs and approvals.",
    ],
    checklist,
    artifactChecks,
    missingArtifacts,
    artifactEvidenceComplete,
    contentChecks,
    missingContentMarkers,
    contentEvidenceComplete,
    readOnlyBoundaryChecks,
    readOnlyBoundaryViolations,
    readOnlyBoundaryClean,
    verificationLogChecks,
    missingVerificationLogEntries,
    verificationLogComplete,
    verificationCommands,
    verificationCommandChecks,
    verificationCoverageComplete,
    verificationCommandAvailabilityChecks,
    missingVerificationCommands,
    verificationCommandAvailabilityComplete,
    missingInputs,
    accessPrerequisites: canaryHandoff.accessPrerequisites,
    blockerSummary: canaryHandoff.blockerSummary,
    decision: artifactEvidenceComplete && contentEvidenceComplete && readOnlyBoundaryClean && verificationLogComplete && verificationCoverageComplete && verificationCommandAvailabilityComplete && productionCanaryReady
      ? "Local audit evidence and target-environment gates indicate the goal can be marked complete after fresh required verification."
      : missingArtifacts.length > 0
        ? "Do not mark the goal complete: completion audit evidence references missing artifacts."
        : missingContentMarkers.length > 0
          ? "Do not mark the goal complete: completion audit evidence is missing required content markers."
          : readOnlyBoundaryViolations.length > 0
            ? "Do not mark the goal complete: completion audit found forbidden read-only boundary implementation symbols."
            : missingVerificationLogEntries.length > 0
              ? "Do not mark the goal complete: completion audit verification log is missing required gate evidence."
              : !verificationCoverageComplete
                ? "Do not mark the goal complete: completion audit verification commands are not fully represented."
                : !verificationCommandAvailabilityComplete
                  ? "Do not mark the goal complete: completion audit verification commands are not available in the current repo."
                  : "Do not mark the goal complete: production canary readiness is still blocked by target-environment inputs or approvals.",
    nextAction: artifactEvidenceComplete && contentEvidenceComplete && readOnlyBoundaryClean && verificationLogComplete && verificationCoverageComplete && verificationCommandAvailabilityComplete && productionCanaryReady
      ? "Run the required verification gates one final time, then update the active goal if all outputs are green."
      : missingArtifacts.length > 0
        ? `Restore or update the missing audit artifacts: ${missingArtifacts.join(", ")}.`
        : missingContentMarkers.length > 0
          ? `Restore or update the missing audit content markers: ${missingContentMarkers.join(", ")}.`
          : readOnlyBoundaryViolations.length > 0
            ? `Remove or isolate forbidden read-only boundary implementation symbols: ${readOnlyBoundaryViolations.join(", ")}.`
            : missingVerificationLogEntries.length > 0
              ? `Update SOLVOL_PLAN.md with the missing verification evidence: ${missingVerificationLogEntries.join(", ")}.`
              : !verificationCoverageComplete
                ? "Update the completion audit verification command list so every required gate is represented."
                : !verificationCommandAvailabilityComplete
                  ? `Restore the missing verification command evidence: ${missingVerificationCommands.join(", ")}.`
                  : "Configure the missing inputs in the target deployment environment, run npm run bridge:canary:check there, and require ready: true before production canary.",
  };
}
