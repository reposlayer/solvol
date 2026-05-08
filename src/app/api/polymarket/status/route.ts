import { NextResponse } from "next/server";
import {
  POLYMARKET_PUBLIC_BASES,
  POLYMARKET_PUBLIC_ENDPOINTS,
  publicPolymarketStatusDescriptor,
} from "@/lib/polymarket/public-api";

export async function GET() {
  return NextResponse.json({
    id: "polymarket-public",
    readOnly: true,
    requiresAuth: false,
    bases: POLYMARKET_PUBLIC_BASES,
    endpoints: POLYMARKET_PUBLIC_ENDPOINTS,
    message: publicPolymarketStatusDescriptor(),
  });
}
