import { NextResponse } from "next/server";
import { logEvent } from "@/lib/auth/log";
import { supabaseServiceRequest } from "@/lib/auth/beta-access";
import { validateWaitlistInput, waitlistRowFromInput, type WaitlistInput } from "@/lib/auth/waitlist";

export const runtime = "nodejs";

async function waitlistInput(request: Request): Promise<Partial<WaitlistInput>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Partial<WaitlistInput>;
  }
  const form = await request.formData();
  return {
    email: String(form.get("email") ?? ""),
    name: String(form.get("name") ?? ""),
    useCase: String(form.get("useCase") ?? ""),
    source: String(form.get("source") ?? ""),
  };
}

function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json");
}

function redirect(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const parsed = validateWaitlistInput(await waitlistInput(request));
    if (!parsed.ok) {
      if (wantsJson(request)) return Response.json({ error: parsed.error }, { status: 400 });
      return redirect(`/waitlist?error=${encodeURIComponent(parsed.error)}`, request);
    }

    const row = waitlistRowFromInput(parsed.value);
    const upsertRow = {
      email: row.email,
      name: row.name,
      use_case: row.use_case,
      source: row.source,
      updated_at: row.updated_at,
    };
    await supabaseServiceRequest(
      `/rest/v1/waitlist_entries?${new URLSearchParams({ on_conflict: "email" }).toString()}`,
      {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: JSON.stringify(upsertRow),
      },
    );

    logEvent("info", "waitlist_submit_done", {
      route: "/api/waitlist",
      email: row.email,
      source: row.source,
      ms: Date.now() - start,
    });

    if (wantsJson(request)) return Response.json({ ok: true, status: "pending" });
    return redirect(`/waitlist?status=joined&email=${encodeURIComponent(row.email)}`, request);
  } catch (err) {
    logEvent("error", "waitlist_submit_failed", {
      route: "/api/waitlist",
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    });
    if (wantsJson(request)) return Response.json({ error: "Waitlist unavailable" }, { status: 503 });
    return redirect("/waitlist?error=Waitlist%20unavailable", request);
  }
}
