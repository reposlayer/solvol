import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { evaluateTerminalBridgeCanaryReadiness } from "../src/lib/terminal/canary-readiness.ts";
import { buildTerminalBridgeCompletionAudit } from "../src/lib/terminal/completion-audit.ts";
import { buildTerminalBridgeRolloutPlan } from "../src/lib/terminal/rollout.ts";

function concreteInputs(inputs: string[]): string[] {
  return Array.from(new Set(inputs.flatMap((input) => input.split(/\s+or\s+/))));
}

test("completion audit maps bridge objective requirements to concrete evidence", async () => {
  const audit = await readFile("docs/terminal-bridge-completion-audit.md", "utf8");

  for (const sourceDoc of [
    "AGENTS.md",
    "SOLVOL_PLAN.md",
    "ARCHITECTURE.md",
    "DATA_CONTRACTS.md",
    "guide.md",
    "BRIDGE_IMPLEMENTATION_ROADMAP.md",
  ]) {
    assert.match(audit, new RegExp(sourceDoc.replace(".", "\\.")));
  }

  for (const requirement of [
    "read-only boundary",
    "deterministic mock fallback",
    "public Polymarket Gamma/CLOB/Data",
    "control plane",
    "market registry",
    "generic ingestion framework",
    "Tier A",
    "on-chain",
    "query compiler",
    "dedupe",
    "event clustering",
    "why-moved",
    "source-health",
    "provenance",
    "SSE/outbox",
    "replay",
    "synthetic",
    "operations docs",
    "production canary",
  ]) {
    assert.match(audit, new RegExp(requirement, "i"), `audit must cover ${requirement}`);
  }

  const canaryBlockers = concreteInputs(evaluateTerminalBridgeCanaryReadiness({}).missingInputs);
  const rolloutBlockers = concreteInputs(
    buildTerminalBridgeRolloutPlan({}).phases.flatMap((phase) => phase.missingInputs),
  );

  for (const blocker of [...new Set([...canaryBlockers, ...rolloutBlockers])]) {
    assert.match(audit, new RegExp(blocker), `audit must name blocker ${blocker}`);
  }

  assert.match(audit, /Vercel team\/project access/i);
  assert.match(audit, /403 Forbidden/i);
  assert.match(audit, /Supabase project tooling/i);
});

test("bridge agent ownership matrix maps requested roles to artifacts and checks", async () => {
  const ownership = await readFile("docs/terminal-bridge-agent-ownership.md", "utf8");

  for (const role of [
    "Chief Architect Agent",
    "Protocol & Contracts Agent",
    "Market Intelligence Agent",
    "External Sources Agent",
    "Normalization & Enrichment Agent",
    "Event Clustering Agent",
    "Correlation & Why-Moved Agent",
  ]) {
    assert.match(ownership, new RegExp(role.replace("&", "&amp;|&")), `ownership matrix must cover ${role}`);
  }

  for (const artifact of [
    "ARCHITECTURE.md",
    "SOLVOL_PROTOCOL.md",
    "DATA_CONTRACTS.md",
    "src/lib/terminal/types.ts",
    "src/lib/terminal/polymarket-source.ts",
    "src/lib/terminal/source-adapters.ts",
    "src/lib/terminal/source-intelligence.ts",
    "src/lib/terminal/query-compiler.ts",
    "test/terminal-ingestion-bridge.test.ts",
    "test/bridge-rollout.test.ts",
  ]) {
    assert.match(ownership, new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `ownership matrix must name ${artifact}`);
  }

  assert.match(ownership, /read-only/i);
  assert.match(ownership, /deterministic/i);
  assert.match(ownership, /production canary/i);
  assert.match(ownership, /npm run lint/);
  assert.match(ownership, /npx tsc --noEmit/);
  assert.match(ownership, /node --test --experimental-strip-types test\/\*\.test\.ts/);
  assert.match(ownership, /npm run build/);
  assert.match(ownership, /npm run bridge:audit/);
  assert.match(ownership, /git diff --check/);
});

test("completion audit explicitly covers named agent responsibilities", async () => {
  const audit = await readFile("docs/terminal-bridge-completion-audit.md", "utf8");
  const ownership = await readFile("docs/terminal-bridge-agent-ownership.md", "utf8");
  const evidence = `${audit}\n${ownership}`;

  for (const responsibility of [
    "approve contracts/interfaces",
    "coordinate integration",
    "service topology",
    "backward-compatible typed flows",
    "market-to-entity mapping",
    "polling and streaming systems",
    "source health and quota management",
    "retry/backoff",
    "resumable cursors",
    "adapter fixture tests",
    "entity extraction",
    "alias resolution",
    "geo extraction",
    "timestamp normalization",
    "source credibility scoring",
    "sentiment rules",
    "event taxonomy",
    "canonical URL normalization",
    "source diversity scoring",
    "novelty scoring",
    "contradiction detection",
    "rumor escalation tracking",
    "event-to-market linking",
    "reaction-window scoring",
    "confidence scoring",
    "evidence breakdowns",
    "insufficient-evidence handling",
    "market divergence",
    "move-quality scoring",
  ]) {
    assert.match(evidence, new RegExp(responsibility, "i"), `audit evidence must cover ${responsibility}`);
  }
});

test("completion audit docs reflect the current verification gate", async () => {
  const audit = await readFile("docs/terminal-bridge-completion-audit.md", "utf8");
  const requiredGateLine = audit
    .split("\n")
    .find((line) => line.includes("before claiming the product foundation is ready"));

  assert.ok(requiredGateLine, "audit must describe the required pre-claim verification gate");
  assert.match(requiredGateLine, /git diff --check/);
  assert.match(audit, /188 tests passed/);
  assert.doesNotMatch(audit, /17[0-9] tests passed|18[0-7] tests passed/);
});

test("completion audit builder emits a prompt-to-artifact checklist and current blockers", () => {
  const audit = buildTerminalBridgeCompletionAudit({});

  assert.equal(audit.readOnly, true);
  assert.equal(audit.achieved, false);
  assert.equal(audit.productionCanaryReady, false);
  assert.ok(audit.objectiveCriteria.some((criterion) => /read-only/i.test(criterion)));
  assert.ok(audit.objectiveCriteria.some((criterion) => /production canary/i.test(criterion)));

  for (const requirement of [
    "Chief Architect Agent",
    "Protocol & Contracts Agent",
    "Market Intelligence Agent",
    "External Sources Agent",
    "Normalization & Enrichment Agent",
    "Event Clustering Agent",
    "Correlation & Why-Moved Agent",
    "read-only boundary",
    "deterministic mock fallback",
    "production canary readiness",
  ]) {
    assert.ok(
      audit.checklist.some((item) => item.requirement === requirement),
      `missing audit checklist item ${requirement}`,
    );
  }

  const blockers = new Set(audit.missingInputs);
  assert.ok(blockers.has("SUPABASE_URL"));
  assert.ok(blockers.has("SOLVOL_CANARY_REVIEWER"));
  assert.ok(audit.accessPrerequisites.some((prerequisite) => prerequisite.id === "vercel_project_settings"));
  assert.ok(audit.accessPrerequisites.some((prerequisite) => prerequisite.id === "supabase_project_admin"));
  assert.ok(audit.verificationCommands.includes("npm run bridge:canary:env-template"));
  assert.ok(audit.verificationCommands.includes("npm run bridge:audit"));
  assert.match(audit.decision, /Do not mark/i);
  assert.match(audit.nextAction, /target deployment environment/i);

  assert.ok(audit.artifactChecks.length > 0, "audit must inspect cited artifact paths");
  assert.deepEqual(audit.missingArtifacts, []);
  assert.ok(audit.artifactEvidenceComplete, "all cited artifacts in the current repo should be present");

  const byPath = new Map(audit.artifactChecks.map((check) => [check.path, check]));
  assert.equal(byPath.get("ARCHITECTURE.md")?.status, "present");
  assert.equal(byPath.get("src/lib/terminal/source-intelligence.ts")?.status, "present");
  assert.ok(
    byPath.get("src/lib/terminal/source-intelligence.ts")?.referencedBy.includes("Correlation & Why-Moved Agent"),
    "artifact checks must connect paths back to objective requirements",
  );

  const byCommand = new Map(audit.verificationCommandChecks.map((check) => [check.command, check]));
  assert.equal(byCommand.get("npm run lint")?.status, "referenced");
  assert.equal(byCommand.get("npm run bridge:canary:env-template")?.status, "referenced");
  assert.equal(byCommand.get("npm run bridge:audit")?.status, "referenced");
  assert.ok(audit.verificationCoverageComplete, "required verification commands should be represented");
});

test("completion audit builder validates required verification commands are available", () => {
  const audit = buildTerminalBridgeCompletionAudit({});

  assert.ok(
    audit.verificationCommandAvailabilityChecks.length > 0,
    "runtime audit must inspect command availability, not just command references",
  );
  assert.deepEqual(audit.missingVerificationCommands, []);
  assert.ok(audit.verificationCommandAvailabilityComplete, "all required verification commands should be available");

  const byCommand = new Map(audit.verificationCommandAvailabilityChecks.map((check) => [check.command, check]));
  assert.equal(byCommand.get("npm run lint")?.status, "available");
  assert.deepEqual(byCommand.get("npm run lint")?.evidence, ["package.json:scripts.lint"]);
  assert.equal(byCommand.get("npm run build")?.status, "available");
  assert.equal(byCommand.get("npm run bridge:canary:env-template")?.status, "available");
  assert.deepEqual(byCommand.get("npm run bridge:canary:env-template")?.evidence, [
    "package.json:scripts.bridge:canary:env-template",
  ]);
  assert.deepEqual(byCommand.get("npm run bridge:audit")?.evidence, ["package.json:scripts.bridge:audit"]);
  assert.equal(byCommand.get("npx tsc --noEmit")?.status, "available");
  assert.ok(byCommand.get("npx tsc --noEmit")?.evidence.includes("tsconfig.json"));
  assert.ok(byCommand.get("npx tsc --noEmit")?.evidence.includes("package.json:devDependencies.typescript"));
  assert.equal(byCommand.get("node --test --experimental-strip-types test/*.test.ts")?.status, "available");
  assert.ok(byCommand.get("node --test --experimental-strip-types test/*.test.ts")?.evidence.includes("test/*.test.ts"));
  assert.equal(byCommand.get("git diff --check")?.status, "available");
  assert.ok(byCommand.get("git diff --check")?.evidence.includes(".git"));
});

test("completion audit builder maps explicit agent responsibilities to runtime checklist items", () => {
  const audit = buildTerminalBridgeCompletionAudit({});
  const requirements = new Set(audit.checklist.map((item) => item.requirement));

  for (const requirement of [
    "approve contracts/interfaces",
    "prevent spaghetti coupling",
    "event and market state machines",
    "price history ingestion",
    "market-to-entity mapping",
    "source health and quota management",
    "retries/backoff/circuit breakers",
    "resumable cursors",
    "adapter fixture tests",
    "entity extraction",
    "alias resolution",
    "timestamp normalization",
    "source credibility scoring",
    "sentiment rules",
    "event taxonomy",
    "simhash/minhash logic",
    "source diversity scoring",
    "novelty scoring",
    "contradiction detection",
    "rumor escalation tracking",
    "event-to-market linker",
    "reaction window analysis",
    "evidence breakdowns",
    "insufficient-evidence handling",
    "market divergence detection",
    "move quality scoring",
  ]) {
    assert.ok(requirements.has(requirement), `runtime audit checklist must include ${requirement}`);
  }

  const moveQuality = audit.checklist.find((item) => item.requirement === "move quality scoring");
  assert.ok(moveQuality?.evidence.includes("src/lib/terminal/source-intelligence.ts"));
  assert.ok(moveQuality?.verification.includes("test/terminal-ingestion-bridge.test.ts"));
});

test("completion audit builder maps roadmap deliverables and named docs to runtime artifact checks", () => {
  const audit = buildTerminalBridgeCompletionAudit({});
  const requirements = new Set(audit.checklist.map((item) => item.requirement));

  for (const requirement of [
    "source planning docs inspected",
    "source truth from normalized data and provenance",
    "control plane and repo commands",
    "generic ingestion framework",
    "source-health/provenance/status APIs",
    "realtime delivery via SSE/outbox",
    "replay and backfill",
    "synthetic injection",
    "operations docs and rollout handoff",
    "read-only completion audit command",
  ]) {
    assert.ok(requirements.has(requirement), `runtime audit checklist must include ${requirement}`);
  }

  const byPath = new Map(audit.artifactChecks.map((check) => [check.path, check]));
  for (const path of [
    "AGENTS.md",
    "SOLVOL_PLAN.md",
    "guide.md",
    "scripts/bridge.mjs",
    "package.json",
    "docs/terminal-bridge-operations.md",
    "src/app/api/terminal/bridge-status/route.ts",
    "src/app/api/terminal/stream/route.ts",
    "src/lib/terminal/raw-store.ts",
    "src/lib/terminal/outbox.ts",
    "src/lib/terminal/synthetic.ts",
  ]) {
    assert.equal(byPath.get(path)?.status, "present", `runtime audit must inspect ${path}`);
  }

  assert.ok(byPath.get("scripts/bridge.mjs")?.referencedBy.includes("control plane and repo commands"));
  assert.ok(byPath.get("docs/terminal-bridge-operations.md")?.referencedBy.includes("operations docs and rollout handoff"));
});

test("completion audit builder validates required content markers inside bridge artifacts", () => {
  const audit = buildTerminalBridgeCompletionAudit({});

  assert.ok(audit.contentChecks.length > 0, "runtime audit must inspect artifact content markers");
  assert.deepEqual(audit.missingContentMarkers, []);
  assert.ok(audit.contentEvidenceComplete, "all required content markers in the current repo should be present");

  const byMarker = new Map(audit.contentChecks.map((check) => [`${check.path}:${check.marker}`, check]));
  for (const [path, marker] of [
    ["AGENTS.md", "Keep Solvol Terminal read-only"],
    ["AGENTS.md", "Polymarket Gamma/CLOB/Data"],
    ["ARCHITECTURE.md", "## Runtime Layers"],
    ["ARCHITECTURE.md", "`runTerminalIngestionBridge()` is the shared source execution boundary"],
    ["ARCHITECTURE.md", "Core deterministic engines:"],
    ["ARCHITECTURE.md", "LLM narration remains optional and cannot replace normalized facts."],
    ["ARCHITECTURE.md", "Production canary remains gated by `npm run bridge:canary:check`"],
    ["BRIDGE_IMPLEMENTATION_ROADMAP.md", "The acceptance bar is not just that the code runs."],
    ["BRIDGE_IMPLEMENTATION_ROADMAP.md", "| Replay non-determinism above tolerance | Pause canary readiness until replay is deterministic |"],
    ["BRIDGE_IMPLEMENTATION_ROADMAP.md", "## Planned File Map"],
    ["docs/terminal-bridge-agent-ownership.md", "Chief Architect Agent: owns architecture direction in `ARCHITECTURE.md`"],
    ["docs/terminal-bridge-agent-ownership.md", "preserve service topology boundaries across UI, API, bridge, persistence, replay, and rollout layers"],
    ["docs/terminal-bridge-agent-ownership.md", "Maintains bridge topology, runtime boundaries, deterministic replay posture, rollout architecture, and anti-coupling review."],
    ["SOLVOL_PROTOCOL.md", "MarketSource"],
    ["SOLVOL_PROTOCOL.md", "External source adapters must satisfy `SourceAdapter`"],
    ["SOLVOL_PROTOCOL.md", "Rejected transitions return a deterministic transition record"],
    ["src/lib/terminal/types.ts", "export type MarketSource"],
    ["src/lib/terminal/types.ts", "export type SourceAdapter<R>"],
    ["src/lib/terminal/types.ts", "export type FetchCursor"],
    ["src/lib/terminal/types.ts", "export type RawDocument"],
    ["src/lib/terminal/types.ts", "export type NewsItem"],
    ["src/lib/terminal/types.ts", "export type EventItem"],
    ["src/lib/terminal/types.ts", "export type TerminalStateTransition<TState extends string>"],
    ["src/lib/terminal/types.ts", "export type WhyMovedScoreBreakdown"],
    ["src/lib/terminal/types.ts", "export type WhyMovedCandidate"],
    ["src/lib/terminal/state-machines.ts", "export function transitionMarketStatus"],
    ["src/lib/terminal/state-machines.ts", "export function transitionEventLifecycle"],
    ["DATA_CONTRACTS.md", "EventMarketLink"],
    ["DATA_CONTRACTS.md", "why_moved_candidate.event_market_link_json"],
    ["DATA_CONTRACTS.md", "Market and event transitions are explicit contracts"],
    ["DATA_CONTRACTS.md", "`RawDocument` metadata is immutable and checksum-backed"],
    ["DATA_CONTRACTS.md", "`source_cursor` state is abstracted by the terminal cursor store"],
    ["src/lib/terminal/polymarket-source.ts", "export function createPolymarketMarketSource()"],
    ["src/lib/terminal/polymarket-source.ts", "yesToken ? fetchYesPriceHistory(yesToken) : Promise.resolve([])"],
    ["src/lib/terminal/polymarket-source.ts", "return market ? movesFromMarket(market) : []"],
    ["src/lib/terminal/polymarket-source.ts", "fetchMarketTrades(market.conditionId, query.limit ?? 40)"],
    ["src/lib/terminal/polymarket-stream.ts", "export const POLYMARKET_PUBLIC_WEBSOCKET_CHANNELS"],
    ["src/lib/terminal/polymarket-stream.ts", "requiresAuth: false"],
    ["src/lib/terminal/polymarket-stream.ts", "export function normalizePolymarketMarketStreamMessage"],
    ["src/lib/terminal/polymarket-stream.ts", "sourceId: \"polymarket-public\""],
    ["src/lib/terminal/query-compiler.ts", "export function compileMarketQueryPack"],
    ["src/lib/terminal/query-compiler.ts", "sourceId: \"federal-reserve-rss\""],
    ["src/lib/terminal/query-compiler.ts", "const gdeltTerms = unique(["],
    ["src/lib/terminal/market-registry.ts", "export function marketToRegistryRecord"],
    ["src/lib/terminal/market-registry.ts", "export function detectPriceReactionWindows"],
    ["src/lib/terminal/market-registry.ts", "reactionWindows: unique.flatMap((market) => detectPriceReactionWindows(market))"],
    ["src/lib/terminal/market-family.ts", "export function classifyMarketFamily"],
    ["src/lib/terminal/market-family.ts", "export function inferMarketFamilyDirection"],
    ["src/lib/terminal/market-family.ts", "const ruleId = `why:market_family:${family}` as const"],
    ["src/lib/terminal/source-adapters.ts", "gdelt-doc"],
    ["src/lib/terminal/source-adapters.ts", "sec-rss"],
    ["src/lib/terminal/source-adapters.ts", "federal-reserve-rss"],
    ["src/lib/terminal/source-adapters.ts", "usgs-earthquakes"],
    ["src/lib/terminal/source-adapters.ts", "cisa-rss"],
    ["src/lib/terminal/source-adapters.ts", "fema-ipaws-rss"],
    ["src/lib/terminal/source-adapters.ts", "etherscan-indexed"],
    ["src/lib/terminal/source-adapters.ts", "ethereum-json-rpc"],
    ["src/lib/terminal/source-adapters.ts", "coingecko-context"],
    ["src/lib/terminal/source-adapters.ts", "reddit-oauth"],
    ["src/lib/terminal/source-adapters.ts", "mastodon-public"],
    ["src/lib/terminal/source-adapters.ts", "gnews-api"],
    ["src/lib/terminal/source-adapters.ts", "mediastack-api"],
    ["src/lib/terminal/source-adapters.ts", "fact-check-overlays"],
    ["src/lib/terminal/source-adapters.ts", "function fixtureAdapter<R>"],
    ["src/lib/terminal/source-adapters.ts", "const tombstoneMarkers = new Set([\"[deleted]\", \"[removed]\"])"],
    ["src/lib/terminal/source-adapters.ts", "const latestBlock = hexToNumber(await rpc(\"eth_blockNumber\", []))"],
    ["src/lib/terminal/source-adapters.ts", "const rows = ethereumLogRowsFromPayload(await rpc(\"eth_getLogs\", [filter]))"],
    ["src/lib/terminal/source-adapters.ts", "if (!apiKey || !opts.queryTerms?.length)"],
    ["src/lib/terminal/ingestion-runner.ts", "function fetchBatchWithRetry"],
    ["src/lib/terminal/ingestion-runner.ts", "baseBackoffMs * (2 ** (attempt - 1))"],
    ["src/lib/terminal/ingestion-runner.ts", "circuit breaker paused source"],
    ["src/lib/terminal/ingestion-runner.ts", "const cursorStore = opts.cursorStore ?? createConfiguredTerminalCursorStore()"],
    ["src/lib/terminal/ingestion-runner.ts", "await cursorStore.commitCursor(pending.sourceId, pending.cursor, now)"],
    ["src/lib/terminal/ingestion-runner.ts", "rateLimitRemaining: record.rateLimitRemaining"],
    ["src/lib/terminal/source-intelligence.ts", "const MARKET_TERM_ALIASES"],
    ["src/lib/terminal/source-intelligence.ts", "aliases: [\"Fed\", \"FOMC\"]"],
    ["src/lib/terminal/source-intelligence.ts", "export function extractEntityRefs"],
    ["src/lib/terminal/source-intelligence.ts", "export function extractGeoRefs"],
    ["src/lib/terminal/source-intelligence.ts", "source: \"source-country\""],
    ["src/lib/terminal/source-intelligence.ts", "export function scoreSentiment"],
    ["src/lib/terminal/source-intelligence.ts", "ruleIds.push(`sent_pos:${rx}`)"],
    ["src/lib/terminal/source-intelligence.ts", "ruleIds.push(`sent_neg:${rx}`)"],
    ["src/lib/terminal/source-intelligence.ts", "export function scoreCredibility"],
    ["src/lib/terminal/source-intelligence.ts", "ruleIds.push(\"cred:corroborated_2plus\")"],
    ["src/lib/terminal/source-intelligence.ts", "export function buildNewsFingerprint"],
    ["src/lib/terminal/source-intelligence.ts", "function eventKindForMembers"],
    ["src/lib/terminal/source-adapters.ts", "occurredAt: input.occurredAt ?? input.publishedAt"],
    ["src/lib/terminal/source-adapters.ts", "dedupeFingerprint: buildNewsFingerprint({"],
    ["src/lib/terminal/market-registry.ts", "entityRefs: namedEntityRefs.length > 0 ? namedEntityRefs : queryPack.entities"],
    ["src/lib/terminal/persistence.ts", "entities_json: market.entityRefs"],
    ["supabase/schema.sql", "entities_json jsonb not null default '[]'::jsonb"],
    ["src/lib/terminal/source-intelligence.ts", "export function dedupeNewsItems"],
    ["src/lib/terminal/source-intelligence.ts", "normalizeSourceUrl(item.canonicalUrl ?? item.sourceUrl)"],
    ["src/lib/terminal/source-intelligence.ts", "algorithm: \"simhash64/minhash-v1\""],
    ["src/lib/terminal/source-intelligence.ts", "const timeline = buildEventTimeline"],
    ["src/lib/terminal/source-intelligence.ts", "sourceDiversityScore: diversityScore"],
    ["src/lib/terminal/source-intelligence.ts", "noveltyScore: clusterNoveltyScore"],
    ["src/lib/terminal/source-intelligence.ts", "const contradictions = detectContradictions(members)"],
    ["src/lib/terminal/source-intelligence.ts", "const rumorStatus = rumorStatusForMembers"],
    ["src/lib/terminal/source-intelligence.ts", "export function linkEventToMarket"],
    ["src/lib/terminal/source-intelligence.ts", "export function linkEventsToMarkets"],
    ["src/lib/terminal/source-intelligence.ts", "const confidence = clamp01(lexical + entity + time + source + corroboration + marketReaction - penalties)"],
    ["src/lib/terminal/source-intelligence.ts", "scoreBreakdown: { lexical, entity, time, source, corroboration, marketReaction, penalties }"],
    ["src/lib/terminal/source-intelligence.ts", "observedPriceMove: {"],
    ["src/lib/terminal/source-intelligence.ts", "function evidenceStatusForCandidate"],
    ["src/lib/terminal/source-intelligence.ts", "status: \"insufficient_evidence\""],
    ["src/lib/terminal/source-intelligence.ts", "function marketDivergenceForDirections"],
    ["src/lib/terminal/source-intelligence.ts", "function scoreMoveQuality"],
    ["scripts/bridge.mjs", "bridge:audit"],
    ["scripts/bridge.mjs", "bridge:canary:check"],
    ["src/lib/terminal/completion-audit.ts", "artifactEvidenceComplete"],
    ["src/lib/terminal/completion-audit.ts", "verificationCoverageComplete"],
  ]) {
    assert.equal(byMarker.get(`${path}:${marker}`)?.status, "present", `runtime audit must verify ${path} contains ${marker}`);
  }

  assert.ok(
    byMarker.get("DATA_CONTRACTS.md:EventMarketLink")?.referencedBy.includes("event-to-market linker"),
    "content checks must connect markers back to objective requirements",
  );
  assert.ok(
    byMarker.get("ARCHITECTURE.md:## Runtime Layers")?.referencedBy.includes("service topology"),
    "content checks must verify architecture runtime layers",
  );
  assert.ok(
    byMarker
      .get("ARCHITECTURE.md:`runTerminalIngestionBridge()` is the shared source execution boundary")
      ?.referencedBy.includes("coordinate integration"),
    "content checks must verify the shared bridge execution boundary",
  );
  assert.ok(
    byMarker.get("ARCHITECTURE.md:Core deterministic engines:")?.referencedBy.includes("deterministic and replayable design"),
    "content checks must verify deterministic engine ownership in ARCHITECTURE.md",
  );
  assert.ok(
    byMarker
      .get("ARCHITECTURE.md:LLM narration remains optional and cannot replace normalized facts.")
      ?.referencedBy.includes("source truth from normalized data and provenance"),
    "content checks must verify LLM narration cannot replace source truth",
  );
  assert.ok(
    byMarker
      .get("ARCHITECTURE.md:Production canary remains gated by `npm run bridge:canary:check`")
      ?.referencedBy.includes("production canary readiness"),
    "content checks must verify production canary remains explicitly gated",
  );
  assert.ok(
    byMarker
      .get("BRIDGE_IMPLEMENTATION_ROADMAP.md:The acceptance bar is not just that the code runs.")
      ?.referencedBy.includes("architecture direction"),
    "content checks must verify roadmap acceptance bar",
  );
  assert.ok(
    byMarker
      .get("BRIDGE_IMPLEMENTATION_ROADMAP.md:| Replay non-determinism above tolerance | Pause canary readiness until replay is deterministic |")
      ?.referencedBy.includes("deterministic and replayable design"),
    "content checks must verify replay nondeterminism pause condition",
  );
  assert.ok(
    byMarker.get("BRIDGE_IMPLEMENTATION_ROADMAP.md:## Planned File Map")?.referencedBy.includes("service topology"),
    "content checks must verify planned file topology",
  );
  assert.ok(
    byMarker
      .get("docs/terminal-bridge-agent-ownership.md:Chief Architect Agent: owns architecture direction in `ARCHITECTURE.md`")
      ?.referencedBy.includes("architecture direction"),
    "content checks must verify Chief Architect ownership of architecture direction",
  );
  assert.ok(
    byMarker
      .get("docs/terminal-bridge-agent-ownership.md:preserve service topology boundaries across UI, API, bridge, persistence, replay, and rollout layers")
      ?.referencedBy.includes("service topology"),
    "content checks must verify Chief Architect service-topology boundaries",
  );
  assert.ok(
    byMarker
      .get("docs/terminal-bridge-agent-ownership.md:Maintains bridge topology, runtime boundaries, deterministic replay posture, rollout architecture, and anti-coupling review.")
      ?.referencedBy.includes("prevent spaghetti coupling"),
    "content checks must verify anti-coupling architecture ownership",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type MarketSource")?.referencedBy.includes("adapter contracts"),
    "content checks must verify shared MarketSource contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("SOLVOL_PROTOCOL.md:External source adapters must satisfy `SourceAdapter`")?.referencedBy.includes("adapter contracts"),
    "content checks must verify the protocol keeps external adapters behind SourceAdapter",
  );
  assert.ok(
    byMarker
      .get("SOLVOL_PROTOCOL.md:Rejected transitions return a deterministic transition record")
      ?.referencedBy.includes("event and market state machines"),
    "content checks must verify the protocol documents rejected transition behavior",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type SourceAdapter<R>")?.referencedBy.includes("adapter contracts"),
    "content checks must verify shared SourceAdapter contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type FetchCursor")?.referencedBy.includes("resumable cursors"),
    "content checks must verify shared cursor contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type RawDocument")?.referencedBy.includes("provenance schema"),
    "content checks must verify raw provenance contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type NewsItem")?.referencedBy.includes("normalize raw payloads"),
    "content checks must verify normalized source-document contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type EventItem")?.referencedBy.includes("domain models and interfaces"),
    "content checks must verify event domain contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/types.ts:export type TerminalStateTransition<TState extends string>")
      ?.referencedBy.includes("event and market state machines"),
    "content checks must verify transition domain contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type WhyMovedScoreBreakdown")?.referencedBy.includes("scoring contracts"),
    "content checks must verify why-moved scoring breakdown contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/types.ts:export type WhyMovedCandidate")?.referencedBy.includes("deterministic why-moved scoring"),
    "content checks must verify why-moved candidate contracts in src/lib/terminal/types.ts",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/state-machines.ts:export function transitionMarketStatus")?.referencedBy.includes("event and market state machines"),
    "content checks must verify market state transition implementation",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/state-machines.ts:export function transitionEventLifecycle")
      ?.referencedBy.includes("event and market state machines"),
    "content checks must verify event lifecycle transition implementation",
  );
  assert.ok(
    byMarker.get("DATA_CONTRACTS.md:Market and event transitions are explicit contracts")?.referencedBy.includes("event and market state machines"),
    "content checks must verify state-machine contracts in DATA_CONTRACTS.md",
  );
  assert.ok(
    byMarker.get("DATA_CONTRACTS.md:`RawDocument` metadata is immutable and checksum-backed")?.referencedBy.includes("provenance schema"),
    "content checks must verify raw payload provenance contracts in DATA_CONTRACTS.md",
  );
  assert.ok(
    byMarker.get("DATA_CONTRACTS.md:`source_cursor` state is abstracted by the terminal cursor store")?.referencedBy.includes("resumable cursors"),
    "content checks must verify cursor store contracts in DATA_CONTRACTS.md",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/polymarket-source.ts:export function createPolymarketMarketSource()")?.referencedBy.includes("public Polymarket Gamma/CLOB/Data"),
    "content checks must verify the public Polymarket market source boundary",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/polymarket-source.ts:yesToken ? fetchYesPriceHistory(yesToken) : Promise.resolve([])")
      ?.referencedBy.includes("price history ingestion"),
    "content checks must verify Polymarket price history ingestion",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/polymarket-source.ts:return market ? movesFromMarket(market) : []")?.referencedBy.includes("market reaction detection"),
    "content checks must verify market move extraction from price history",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/polymarket-source.ts:fetchMarketTrades(market.conditionId, query.limit ?? 40)")
      ?.referencedBy.includes("public Polymarket Gamma/CLOB/Data"),
    "content checks must verify public Polymarket trade/activity reads",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/polymarket-stream.ts:export const POLYMARKET_PUBLIC_WEBSOCKET_CHANNELS")
      ?.referencedBy.includes("websocket consumers"),
    "content checks must verify public market websocket manifest",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/polymarket-stream.ts:requiresAuth: false")?.referencedBy.includes("read-only boundary"),
    "content checks must verify public market websocket stays unauthenticated",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/polymarket-stream.ts:export function normalizePolymarketMarketStreamMessage")
      ?.referencedBy.includes("websocket consumers"),
    "content checks must verify market websocket normalization",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/polymarket-stream.ts:sourceId: \"polymarket-public\"")?.referencedBy.includes("market state tracking"),
    "content checks must verify public market stream checkpoints are source-tagged",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/query-compiler.ts:export function compileMarketQueryPack")?.referencedBy.includes("market query compiler"),
    "content checks must verify market query compiler implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/query-compiler.ts:sourceId: \"federal-reserve-rss\"")?.referencedBy.includes("market query compiler"),
    "content checks must verify query compiler source prioritization",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/query-compiler.ts:const gdeltTerms = unique([")?.referencedBy.includes("market query compiler"),
    "content checks must verify query compiler GDELT term output",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/market-registry.ts:export function marketToRegistryRecord")?.referencedBy.includes("market registry"),
    "content checks must verify market registry record construction",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/market-registry.ts:export function detectPriceReactionWindows")?.referencedBy.includes("market reaction detection"),
    "content checks must verify price reaction window detection",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/market-registry.ts:reactionWindows: unique.flatMap((market) => detectPriceReactionWindows(market))")
      ?.referencedBy.includes("market reaction detection"),
    "content checks must verify registry reconciliation emits reaction windows",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/market-family.ts:export function classifyMarketFamily")?.referencedBy.includes("market family classification"),
    "content checks must verify market family classification implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/market-family.ts:export function inferMarketFamilyDirection")?.referencedBy.includes("market family classification"),
    "content checks must verify market-family direction inference",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/market-family.ts:const ruleId = `why:market_family:${family}` as const")
      ?.referencedBy.includes("deterministic why-moved scoring"),
    "content checks must verify market-family direction rule IDs",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-adapters.ts:fema-ipaws-rss")?.referencedBy.includes("FEMA"),
    "content checks must connect explicit source IDs back to objective requirements",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-adapters.ts:gnews-api")?.referencedBy.includes("optional secondary news APIs"),
    "content checks must connect optional source IDs back to objective requirements",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-adapters.ts:function fixtureAdapter<R>")?.referencedBy.includes("adapter fixture tests"),
    "content checks must verify deterministic fixture adapter fallback implementation",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/source-adapters.ts:const tombstoneMarkers = new Set([\"[deleted]\", \"[removed]\"])")
      ?.referencedBy.includes("Reddit"),
    "content checks must verify Reddit tombstone handling",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/source-adapters.ts:const latestBlock = hexToNumber(await rpc(\"eth_blockNumber\", []))")
      ?.referencedBy.includes("Ethereum JSON-RPC"),
    "content checks must verify Ethereum JSON-RPC uses read-only block reads",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/source-adapters.ts:const rows = ethereumLogRowsFromPayload(await rpc(\"eth_getLogs\", [filter]))")
      ?.referencedBy.includes("Ethereum JSON-RPC"),
    "content checks must verify Ethereum JSON-RPC uses read-only log reads",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/source-adapters.ts:if (!apiKey || !opts.queryTerms?.length)")
      ?.referencedBy.includes("optional secondary news APIs"),
    "content checks must verify optional commercial news adapters fall back without credentials or terms",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/ingestion-runner.ts:function fetchBatchWithRetry")?.referencedBy.includes("retries/backoff/circuit breakers"),
    "content checks must verify retry wrapper implementation",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/ingestion-runner.ts:baseBackoffMs * (2 ** (attempt - 1))")
      ?.referencedBy.includes("retries/backoff/circuit breakers"),
    "content checks must verify deterministic exponential backoff implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/ingestion-runner.ts:circuit breaker paused source")?.referencedBy.includes("retries/backoff/circuit breakers"),
    "content checks must verify circuit breaker degradation output",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/ingestion-runner.ts:const cursorStore = opts.cursorStore ?? createConfiguredTerminalCursorStore()")
      ?.referencedBy.includes("resumable cursors"),
    "content checks must verify configured cursor store wiring",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/ingestion-runner.ts:await cursorStore.commitCursor(pending.sourceId, pending.cursor, now)")
      ?.referencedBy.includes("resumable cursors"),
    "content checks must verify cursor commits happen after successful persistence",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/ingestion-runner.ts:rateLimitRemaining: record.rateLimitRemaining")
      ?.referencedBy.includes("source health and quota management"),
    "content checks must verify source quota metadata is captured",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:const MARKET_TERM_ALIASES")?.referencedBy.includes("alias resolution"),
    "content checks must verify deterministic alias table wiring",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:aliases: [\"Fed\", \"FOMC\"]")?.referencedBy.includes("alias resolution"),
    "content checks must verify concrete alias expansion examples",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function extractEntityRefs")?.referencedBy.includes("entity extraction"),
    "content checks must verify entity extraction implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function extractGeoRefs")?.referencedBy.includes("geo extraction"),
    "content checks must verify geo extraction implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:source: \"source-country\"")?.referencedBy.includes("geo extraction"),
    "content checks must verify source-country geo fallback",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function scoreSentiment")?.referencedBy.includes("sentiment rules"),
    "content checks must verify sentiment scoring implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:ruleIds.push(`sent_pos:${rx}`)")?.referencedBy.includes("sentiment rules"),
    "content checks must verify positive sentiment rule IDs",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:ruleIds.push(`sent_neg:${rx}`)")?.referencedBy.includes("sentiment rules"),
    "content checks must verify negative sentiment rule IDs",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function scoreCredibility")?.referencedBy.includes("source credibility scoring"),
    "content checks must verify credibility scoring implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:ruleIds.push(\"cred:corroborated_2plus\")")?.referencedBy.includes("source credibility scoring"),
    "content checks must verify corroboration credibility rule IDs",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function buildNewsFingerprint")?.referencedBy.includes("deterministic transforms"),
    "content checks must verify deterministic news fingerprints",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:function eventKindForMembers")?.referencedBy.includes("event taxonomy"),
    "content checks must verify event taxonomy derivation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-adapters.ts:occurredAt: input.occurredAt ?? input.publishedAt")?.referencedBy.includes("timestamp normalization"),
    "content checks must verify timestamp normalization fallback",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-adapters.ts:dedupeFingerprint: buildNewsFingerprint({")?.referencedBy.includes("deterministic transforms"),
    "content checks must verify normalized rows carry deterministic fingerprints",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/market-registry.ts:entityRefs: namedEntityRefs.length > 0 ? namedEntityRefs : queryPack.entities")
      ?.referencedBy.includes("market-to-entity mapping"),
    "content checks must verify market registry entity mapping implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/persistence.ts:entities_json: market.entityRefs")?.referencedBy.includes("market-to-entity mapping"),
    "content checks must verify market entity mappings are persisted",
  );
  assert.ok(
    byMarker.get("supabase/schema.sql:entities_json jsonb not null default '[]'::jsonb")?.referencedBy.includes("market-to-entity mapping"),
    "content checks must verify durable market entity mapping schema",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function dedupeNewsItems")?.referencedBy.includes("deduplication"),
    "content checks must verify event deduplication implementation",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/source-intelligence.ts:normalizeSourceUrl(item.canonicalUrl ?? item.sourceUrl)")
      ?.referencedBy.includes("canonical URL normalization"),
    "content checks must verify canonical URL normalization in clustering inputs",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:algorithm: \"simhash64/minhash-v1\"")?.referencedBy.includes("simhash/minhash logic"),
    "content checks must verify near-duplicate signature implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:const timeline = buildEventTimeline")?.referencedBy.includes("event timelines"),
    "content checks must verify event timeline construction",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:sourceDiversityScore: diversityScore")?.referencedBy.includes("source diversity scoring"),
    "content checks must verify source diversity scoring output",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:noveltyScore: clusterNoveltyScore")?.referencedBy.includes("novelty scoring"),
    "content checks must verify novelty scoring output",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:const contradictions = detectContradictions(members)")?.referencedBy.includes("contradiction detection"),
    "content checks must verify contradiction detection wiring",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:const rumorStatus = rumorStatusForMembers")?.referencedBy.includes("rumor escalation tracking"),
    "content checks must verify rumor lifecycle wiring",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function linkEventToMarket")?.referencedBy.includes("event-to-market linker"),
    "content checks must verify event-to-market linker implementation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:export function linkEventsToMarkets")?.referencedBy.includes("market candidate generation"),
    "content checks must verify market candidate generation implementation",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/source-intelligence.ts:const confidence = clamp01(lexical + entity + time + source + corroboration + marketReaction - penalties)")
      ?.referencedBy.includes("confidence scoring"),
    "content checks must verify why-moved confidence scoring formula",
  );
  assert.ok(
    byMarker
      .get("src/lib/terminal/source-intelligence.ts:scoreBreakdown: { lexical, entity, time, source, corroboration, marketReaction, penalties }")
      ?.referencedBy.includes("evidence breakdowns"),
    "content checks must verify deterministic evidence score breakdowns",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:observedPriceMove: {")?.referencedBy.includes("reaction window analysis"),
    "content checks must verify reaction window evidence is attached",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:function evidenceStatusForCandidate")?.referencedBy.includes("insufficient-evidence handling"),
    "content checks must verify why-moved evidence status handling",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:status: \"insufficient_evidence\"")?.referencedBy.includes("insufficient-evidence handling"),
    "content checks must verify insufficient evidence degradation",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:function marketDivergenceForDirections")?.referencedBy.includes("market divergence detection"),
    "content checks must verify market divergence detection",
  );
  assert.ok(
    byMarker.get("src/lib/terminal/source-intelligence.ts:function scoreMoveQuality")?.referencedBy.includes("move quality scoring"),
    "content checks must verify move quality scoring",
  );
});

test("completion audit builder scans production surfaces for forbidden read-only boundary symbols", () => {
  const audit = buildTerminalBridgeCompletionAudit({});

  assert.ok(audit.readOnlyBoundaryChecks.length > 0, "runtime audit must scan production files for mutating terminal symbols");
  assert.deepEqual(audit.readOnlyBoundaryViolations, []);
  assert.ok(audit.readOnlyBoundaryClean, "production surfaces should not contain forbidden trading or custody implementation symbols");

  const byPath = new Map(audit.readOnlyBoundaryChecks.map((check) => [check.path, check]));
  assert.equal(byPath.get("src/lib/polymarket/public-api.ts")?.status, "clear");
  assert.equal(byPath.get("scripts/bridge.mjs")?.status, "clear");
  assert.equal(byPath.get("supabase/schema.sql")?.status, "clear");
  assert.ok(
    byPath.get("src/lib/polymarket/public-api.ts")?.forbiddenMatches.length === 0,
    "public Polymarket reads must stay free of mutating implementation symbols",
  );
});

test("completion audit builder validates the latest verification log markers", () => {
  const audit = buildTerminalBridgeCompletionAudit({});

  assert.ok(audit.verificationLogChecks.length > 0, "runtime audit must inspect the verification log");
  assert.deepEqual(audit.missingVerificationLogEntries, []);
  assert.ok(audit.verificationLogComplete, "required verification log markers should be present");

  const byMarker = new Map(audit.verificationLogChecks.map((check) => [check.marker, check]));
  for (const marker of [
    "`npm run lint` -> passed",
    "`npx tsc --noEmit` -> passed",
    "`node --test --experimental-strip-types test/*.test.ts` -> passed, 188 tests",
    "`npm run build` -> passed",
    "`npm run bridge:canary:env-template` -> passed as a read-only dry run",
    "`npm run bridge:canary:check` -> passed as a read-only dry run and still reports `ready: false`",
    "`npm run bridge:audit` -> passed as a read-only dry run",
    "`git diff --check` -> passed",
    "completionAudit.achieved: false",
    "productionCanaryReady: false",
  ]) {
    assert.equal(byMarker.get(marker)?.status, "present", `runtime audit must verify SOLVOL_PLAN.md contains ${marker}`);
  }

  assert.ok(
    byMarker.get("`node --test --experimental-strip-types test/*.test.ts` -> passed, 188 tests")
      ?.referencedBy.includes("Required verification gate"),
    "verification log checks must connect markers back to the release gate",
  );
  assert.ok(
    byMarker.get("`npm run bridge:canary:env-template` -> passed as a read-only dry run")
      ?.referencedBy.includes("Required verification gate"),
    "canary env-template verification must be connected back to the release gate",
  );
});

test("bridge audit command emits the read-only completion audit payload", () => {
  const payload = JSON.parse(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/bridge.mjs", "bridge:audit"],
    { encoding: "utf8" },
  ));

  assert.equal(payload.readOnly, true);
  assert.equal(payload.completionAudit.readOnly, true);
  assert.equal(payload.completionAudit.achieved, false);
  assert.ok(payload.completionAudit.missingInputs.includes("SOLVOL_CANARY_REVIEWER"));
  assert.ok(payload.completionAudit.accessPrerequisites.some((prerequisite: { id: string }) => prerequisite.id === "vercel_project_settings"));
});
