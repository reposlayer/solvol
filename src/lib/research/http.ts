import { ResearchStoreError } from "@/lib/research/supabase";

export function researchErrorResponse(err: unknown) {
  if (err instanceof ResearchStoreError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Research request failed";
  return Response.json({ error: message }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ResearchStoreError("Invalid JSON body", 400);
  }
}
