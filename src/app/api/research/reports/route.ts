import { readJson, researchErrorResponse } from "@/lib/research/http";
import { createReport, listReports, userFromRequest } from "@/lib/research/supabase";

export const runtime = "nodejs";

type CreateReportBody = {
  title: string;
  marketIds: string[];
  bodyMd: string;
  isPublic?: boolean;
};

export async function GET(request: Request) {
  try {
    const user = await userFromRequest(request);
    const items = await listReports(user);
    return Response.json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return researchErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await userFromRequest(request);
    const body = await readJson<CreateReportBody>(request);
    if (!body.title || !Array.isArray(body.marketIds)) {
      return Response.json({ error: "Missing report title or marketIds" }, { status: 400 });
    }
    const result = await createReport(user, {
      title: body.title,
      marketIds: body.marketIds,
      bodyMd: body.bodyMd ?? "",
      isPublic: body.isPublic ?? false,
    });
    return Response.json(result);
  } catch (err) {
    return researchErrorResponse(err);
  }
}
