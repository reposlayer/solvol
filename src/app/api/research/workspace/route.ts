import { readJson, researchErrorResponse } from "@/lib/research/http";
import { getWorkspace, saveWorkspacePatch, userFromRequest } from "@/lib/research/supabase";

export const runtime = "nodejs";

type WorkspacePatch = Parameters<typeof saveWorkspacePatch>[1];

export async function GET(request: Request) {
  try {
    const user = await userFromRequest(request);
    const workspace = await getWorkspace(user);
    return Response.json({ user, workspace, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return researchErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await userFromRequest(request);
    const patch = await readJson<WorkspacePatch>(request);
    const result = await saveWorkspacePatch(user, patch);
    const workspace = await getWorkspace(user);
    return Response.json({ ...result, workspace });
  } catch (err) {
    return researchErrorResponse(err);
  }
}
