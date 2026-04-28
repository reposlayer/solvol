import { readJson, researchErrorResponse } from "@/lib/research/http";
import { createAlert, listAlerts, userFromRequest } from "@/lib/research/supabase";
import type { AlertRule } from "@/lib/research/types";

export const runtime = "nodejs";

type CreateAlertBody = {
  marketId?: string | null;
  name: string;
  kind: AlertRule["kind"];
  threshold?: number | null;
};

export async function GET(request: Request) {
  try {
    const user = await userFromRequest(request);
    const payload = await listAlerts(user);
    return Response.json({ ...payload, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return researchErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await userFromRequest(request);
    const body = await readJson<CreateAlertBody>(request);
    if (!body.name || !body.kind) {
      return Response.json({ error: "Missing alert name or kind" }, { status: 400 });
    }
    const result = await createAlert(user, body);
    return Response.json(result);
  } catch (err) {
    return researchErrorResponse(err);
  }
}
