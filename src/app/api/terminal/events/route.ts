import {
  TERMINAL_SYNTHETIC_SCENARIOS,
  buildTerminalSyntheticScenario,
  type TerminalSyntheticScenarioName,
} from "@/lib/terminal/synthetic";
import { fetchTerminalEventsSnapshot } from "@/lib/terminal/serving";

export const runtime = "nodejs";

function scenarioFromRequest(request: Request): TerminalSyntheticScenarioName | null {
  const url = new URL(request.url);
  const requested = url.searchParams.get("scenario") ?? "breaking-news-spike";
  return TERMINAL_SYNTHETIC_SCENARIOS.includes(requested as TerminalSyntheticScenarioName)
    ? requested as TerminalSyntheticScenarioName
    : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scenario = scenarioFromRequest(request);
  if (!scenario) {
    return Response.json({
      readOnly: true,
      error: "unknown_synthetic_scenario",
      availableScenarios: TERMINAL_SYNTHETIC_SCENARIOS,
    }, { status: 400 });
  }

  const durable = await fetchTerminalEventsSnapshot({
    limit: Number(url.searchParams.get("limit") ?? 25),
  });
  if (durable.mode === "durable" && durable.eventClusters.length > 0) {
    return Response.json({
      ...durable,
      sourceHealth: [],
    });
  }

  const snapshot = buildTerminalSyntheticScenario({ scenario });
  return Response.json({
    readOnly: true,
    fetchedAt: snapshot.generatedAt,
    mode: "deterministic_synthetic_fallback",
    scenario: snapshot.scenario,
    newsItems: snapshot.newsItems,
    eventClusters: snapshot.eventClusters,
    sourceHealth: snapshot.sourceHealth,
  });
}
