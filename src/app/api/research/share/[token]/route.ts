import { researchErrorResponse } from "@/lib/research/http";
import { getSharedReport } from "@/lib/research/supabase";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const report = await getSharedReport(token);
    if (!report) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }
    return Response.json({ report });
  } catch (err) {
    return researchErrorResponse(err);
  }
}
