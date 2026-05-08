import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildTerminalBridgeStatusPayload,
} from "../src/lib/terminal/bridge-status.ts";
import {
  fetchTerminalEventsSnapshot,
  fetchTerminalProvenanceSnapshot,
  fetchTerminalWhyMovedSnapshot,
} from "../src/lib/terminal/serving.ts";

test("terminal bridge serving routes expose latest events, provenance, and status", async () => {
  const eventsRoute = await readFile("src/app/api/terminal/events/route.ts", "utf8");
  const provenanceRoute = await readFile("src/app/api/terminal/provenance/route.ts", "utf8");
  const whyMovedRoute = await readFile("src/app/api/terminal/why-moved/route.ts", "utf8");
  const statusRoute = await readFile("src/app/api/terminal/bridge-status/route.ts", "utf8");

  assert.match(eventsRoute, /eventClusters/);
  assert.match(eventsRoute, /newsItems/);
  assert.match(eventsRoute, /fetchTerminalEventsSnapshot/);
  assert.match(eventsRoute, /readOnly:\s*true/);

  assert.match(provenanceRoute, /provenance/);
  assert.match(provenanceRoute, /memberNewsItems/);
  assert.match(provenanceRoute, /fetchTerminalProvenanceSnapshot/);
  assert.match(provenanceRoute, /readOnly:\s*true/);

  assert.match(whyMovedRoute, /whyMovedCandidates/);
  assert.match(whyMovedRoute, /fetchTerminalWhyMovedSnapshot/);
  assert.match(whyMovedRoute, /readOnly:\s*true/);

  assert.match(statusRoute, /buildTerminalBridgeStatusPayload/);
});

test("durable terminal serving reads bridge rows without mutation", async () => {
  const provenance = {
    sourceId: "fed-rss",
    sourceClass: "official",
    externalId: "fed:2026-05-07",
    sourceUrl: "https://federalreserve.gov/release",
    fetchedAt: "2026-05-07T12:00:00.000Z",
    publishedAt: "2026-05-07T11:58:00.000Z",
    rawBlobKey: "raw/fed-rss/fed:2026-05-07.json",
    checksumSha256: "abc123",
    adapterVersion: "fed-rss-fixture-v1",
  };
  const newsPayload = {
    id: "news-fed-1",
    sourceId: "fed-rss",
    sourceClass: "official",
    externalId: "fed:2026-05-07",
    headline: "Federal Reserve approves rate cut timeline",
    summary: "The Committee approved a path toward lower rates.",
    canonicalUrl: "https://federalreserve.gov/release",
    sourceUrl: "https://federalreserve.gov/release",
    publisherName: "Federal Reserve",
    publisherDomain: "federalreserve.gov",
    observedAt: "2026-05-07T12:00:00.000Z",
    publishedAt: "2026-05-07T11:58:00.000Z",
    categories: ["macro"],
    topics: ["rates"],
    entities: [],
    sentiment: { label: "positive", score: 0.4, ruleIds: ["sentiment:approval"] },
    credibility: { label: "high", score: 0.95, ruleIds: ["source:official"], reasons: ["official source"] },
    dedupeFingerprint: "fp-fed",
    provenance: [provenance],
  };
  const eventRow = {
    id: "event-fed-1",
    cluster_key: "cluster:fed",
    kind: "official_statement",
    title: "Federal Reserve approves rate cut timeline",
    abstract: "The Committee approved a path toward lower rates.",
    occurred_at: "2026-05-07T11:58:00.000Z",
    first_seen_at: "2026-05-07T12:00:00.000Z",
    last_seen_at: "2026-05-07T12:00:00.000Z",
    time_precision: "minute",
    source_count: 1,
    source_mix: ["official"],
    primary_entities_json: [],
    geo_json: [],
    topics: ["rates"],
    sentiment_json: newsPayload.sentiment,
    credibility_score: 0.95,
    credibility_json: newsPayload.credibility,
    source_diversity_score: 0.4,
    novelty_score: 1,
    lifecycle_status: "corroborated",
    rumor_status: "not_rumor",
    contradictions_json: [],
    text_signature_json: {},
    representative_news_item_id: "news-fed-1",
    provenance_json: [provenance],
  };
  const candidateRow = {
    id: "candidate-fed-1",
    market_id: "market-fed",
    event_id: "event-fed-1",
    move_id: "move-fed-1",
    direction: "yes",
    evidence_status: "supported",
    confidence: 0.87,
    score_breakdown_json: {
      lexical: 0.8,
      entity: 0.7,
      time: 0.9,
      source: 1,
      corroboration: 0.4,
      marketReaction: 0.8,
      penalties: 0,
    },
    move_quality_json: {
      label: "strong",
      score: 0.82,
      components: { magnitude: 0.8, volume: 0.9, timing: 0.8, directionClarity: 0.8 },
      ruleIds: ["move:strong"],
    },
    market_divergence_json: {
      detected: false,
      expectedDirection: "yes",
      observedDirection: "yes",
      ruleIds: ["market:aligned"],
    },
    observed_price_move_json: {
      from: 0.49,
      to: 0.62,
      absChange: 0.13,
      windowStart: "2026-05-07T11:35:00.000Z",
      windowEnd: "2026-05-07T12:05:00.000Z",
    },
    reasons: ["official source matched the move"],
    rule_ids: ["why:moved"],
    supporting_news_item_ids: ["news-fed-1"],
    conflicting_news_item_ids: [],
    created_at: "2026-05-07T12:06:00.000Z",
  };

  const calls: Array<{ path: string; method: string | undefined }> = [];
  const request = async (path: string, init: RequestInit) => {
    calls.push({ path, method: init.method });
    if (path.includes("/event_cluster_member")) return [{ event_id: "event-fed-1", news_item_id: "news-fed-1" }];
    if (path.includes("/event_cluster")) return [eventRow];
    if (path.includes("/news_item")) return [{ id: "news-fed-1", jsonb_payload: newsPayload }];
    if (path.includes("/why_moved_candidate")) return [candidateRow];
    return [];
  };
  const config = { url: "https://supabase.example", serviceKey: "service-role" };

  const events = await fetchTerminalEventsSnapshot({ config, request, now: "2026-05-07T12:07:00.000Z" });
  const eventProvenance = await fetchTerminalProvenanceSnapshot({
    eventId: "event-fed-1",
    config,
    request,
    now: "2026-05-07T12:07:00.000Z",
  });
  const whyMoved = await fetchTerminalWhyMovedSnapshot({
    marketId: "market-fed",
    config,
    request,
    now: "2026-05-07T12:07:00.000Z",
  });

  assert.equal(events.mode, "durable");
  assert.equal(events.eventClusters[0]?.id, "event-fed-1");
  assert.equal(events.newsItems[0]?.id, "news-fed-1");
  assert.equal(eventProvenance.mode, "durable");
  assert.equal(eventProvenance.event?.id, "event-fed-1");
  assert.equal(eventProvenance.provenance[0]?.checksumSha256, "abc123");
  assert.equal(whyMoved.mode, "durable");
  assert.equal(whyMoved.whyMovedCandidates[0]?.moveId, "move-fed-1");
  assert.equal(whyMoved.whyMovedCandidates[0]?.evidenceStatus, "supported");
  assert.deepEqual([...new Set(calls.map((call) => call.method))], ["GET"]);
  assert.ok(calls.some((call) => call.path.includes("/event_cluster")));
  assert.ok(calls.some((call) => call.path.includes("/news_item")));
  assert.ok(calls.some((call) => call.path.includes("/why_moved_candidate")));
});

test("bridge status payload exposes runtime completion audit contract", () => {
  const payload = buildTerminalBridgeStatusPayload({
    env: {},
    now: "2026-05-07T12:00:00.000Z",
  });

  assert.equal(payload.readOnly, true);
  assert.equal(payload.fetchedAt, "2026-05-07T12:00:00.000Z");
  assert.ok(payload.commands.some((command) => command.name === "bridge:audit"));
  assert.ok(payload.sources.every((source) => source.readOnly));
  assert.equal(payload.completionAudit.readOnly, true);
  assert.equal(payload.completionAudit.achieved, false);
  assert.equal(payload.completionAudit.productionCanaryReady, false);
  assert.ok(payload.completionAudit.missingInputs.includes("SOLVOL_CANARY_REVIEWER"));
  assert.ok(payload.completionAudit.verificationCommands.includes("npm run bridge:canary:check"));
  assert.ok(payload.completionAudit.verificationCommands.includes("npm run bridge:audit"));
  assert.equal(payload.canaryHandoff.readyForProductionCanary, false);
  assert.equal(payload.rollout.readyForGeneralRollout, false);
  assert.equal(payload.sourcePolicy.reviewComplete, false);
});
