import {
  TERMINAL_SYNTHETIC_SCENARIOS,
  buildTerminalSyntheticScenario,
  type TerminalSyntheticScenarioName,
} from "@/lib/terminal/synthetic";
import { fetchTerminalProvenanceSnapshot } from "@/lib/terminal/serving";

export const runtime = "nodejs";

function scenarioFromUrl(url: URL): TerminalSyntheticScenarioName | null {
  const requested = url.searchParams.get("scenario") ?? "breaking-news-spike";
  return TERMINAL_SYNTHETIC_SCENARIOS.includes(requested as TerminalSyntheticScenarioName)
    ? requested as TerminalSyntheticScenarioName
    : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scenario = scenarioFromUrl(url);
  if (!scenario) {
    return Response.json({
      readOnly: true,
      error: "unknown_synthetic_scenario",
      availableScenarios: TERMINAL_SYNTHETIC_SCENARIOS,
    }, { status: 400 });
  }

  const requestedEventId = url.searchParams.get("eventId");
  if (requestedEventId) {
    const durable = await fetchTerminalProvenanceSnapshot({ eventId: requestedEventId });
    if (durable.mode === "durable" && durable.event) {
      return Response.json(durable);
    }
  }

  const snapshot = buildTerminalSyntheticScenario({ scenario });
  const event = requestedEventId
    ? snapshot.eventClusters.find((cluster) => cluster.id === requestedEventId)
    : snapshot.eventClusters[0];
  const memberIds = new Set(event?.memberNewsItemIds ?? []);
  const memberNewsItems = snapshot.newsItems.filter((item) => memberIds.has(item.id));

  return Response.json({
    readOnly: true,
    fetchedAt: snapshot.generatedAt,
    mode: "deterministic_synthetic_fallback",
    event,
    memberNewsItems,
    provenance: memberNewsItems.flatMap((item) => item.provenance),
  });
}
