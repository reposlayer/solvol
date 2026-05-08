import {
  fetchDeliveryOutboxEvents,
  formatSseEvent,
  terminalOutboxConfigFromEnv,
  type DeliveryOutboxEvent,
} from "@/lib/terminal/outbox";

export const runtime = "nodejs";

function parseSeq(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function statusEvent(configured: boolean): DeliveryOutboxEvent {
  return {
    seq: 0,
    topic: "terminal.bridge_status",
    payload: {
      readOnly: true,
      configured,
      message: configured
        ? "Delivery outbox stream is connected."
        : "Delivery outbox stream is running without Supabase configuration.",
    },
    createdAt: new Date().toISOString(),
    sentAt: null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = terminalOutboxConfigFromEnv();
  const afterSeq = parseSeq(url.searchParams.get("after"));
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25, 1), 100);
  const events = await fetchDeliveryOutboxEvents({
    afterSeq,
    limit,
    config,
  }).catch(() => []);
  const body = [
    formatSseEvent(statusEvent(Boolean(config))),
    ...events.map(formatSseEvent),
  ].join("");

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
