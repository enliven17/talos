/**
 * GET /api/axl/status
 *
 * Returns AXL node status for the dashboard — topology summary, active peer
 * count, and our peer ID. The browser never talks to localhost:9002 directly;
 * all AXL access is proxied through this route.
 */

import { NextResponse } from "next/server";
import { getAXLStatus } from "@/lib/axl";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getAXLStatus();
  return NextResponse.json(status);
}
