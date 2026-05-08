import { ResearchStoreError } from "@/lib/research/supabase";
import { logEvent } from "@/lib/auth/log";

export function researchErrorResponse(err: unknown) {
  if (err instanceof ResearchStoreError) {
    logEvent("error", "research_request_failed", {
      status: err.status,
      error: err.message,
    });
    return Response.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Research request failed";
  logEvent("error", "research_request_failed", {
    status: 500,
    error: message,
  });
  return Response.json({ error: message }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ResearchStoreError("Invalid JSON body", 400);
  }
}
