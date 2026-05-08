import { buildTerminalBridgeStatusPayload } from "@/lib/terminal/bridge-status";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(buildTerminalBridgeStatusPayload());
}
