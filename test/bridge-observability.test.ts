import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTerminalBridgeObservabilityCatalog,
} from "../src/lib/terminal/observability.ts";

test("bridge observability catalog covers canary dashboards and alert routes", () => {
  const catalog = buildTerminalBridgeObservabilityCatalog();

  assert.equal(catalog.readOnly, true);
  assert.ok(catalog.dashboards.length >= 4);
  assert.ok(catalog.alerts.length >= 5);

  const dashboardMetrics = new Set(catalog.dashboards.flatMap((dashboard) => dashboard.metrics));
  for (const metric of [
    "source.lag.seconds",
    "source.errors.count",
    "source.backlog.count",
    "source.accepted.count",
    "dlq.replayable.count",
    "fanout.latency.ms",
    "replay.deterministic_cluster_share",
  ]) {
    assert.ok(dashboardMetrics.has(metric), `missing dashboard metric ${metric}`);
  }

  const alertIds = new Set(catalog.alerts.map((alert) => alert.id));
  for (const alertId of [
    "source_failure",
    "rate_limit_incident",
    "replay_nondeterminism",
    "dlq_growth",
    "fanout_lag",
  ]) {
    assert.ok(alertIds.has(alertId), `missing alert ${alertId}`);
  }

  assert.ok(catalog.alerts.every((alert) => alert.requiresRouting));
  assert.ok(catalog.dashboards.every((dashboard) => dashboard.requiresMetricsBackend));
});

test("bridge observability catalog reports readiness from environment inputs", () => {
  const blocked = buildTerminalBridgeObservabilityCatalog({});
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.missingInputs, [
    "SOLVOL_METRICS_DSN",
    "SOLVOL_ALERT_ROUTING_URL",
  ]);

  const ready = buildTerminalBridgeObservabilityCatalog({
    SOLVOL_METRICS_DSN: "https://metrics.example.test",
    SOLVOL_ALERT_ROUTING_URL: "https://alerts.example.test",
  });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missingInputs, []);
});
