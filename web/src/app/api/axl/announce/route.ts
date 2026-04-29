/**
 * POST /api/axl/announce
 *
 * Announce a Talos agent's service on the AXL P2P mesh from the web layer.
 * Called automatically when an agent comes online (from the agent status
 * update endpoint) so peers can discover it without hitting the central API.
 *
 * Body: { talosId, serviceName, price, description, walletAddress, apiUrl? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { announceServiceOnAXL } from "@/lib/axl";

export const dynamic = "force-dynamic";

const schema = z.object({
  talosId: z.string().min(1),
  serviceName: z.string().min(1),
  price: z.number().min(0),
  description: z.string().default(""),
  walletAddress: z.string().default(""),
  apiUrl: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const result = await announceServiceOnAXL(parsed.data);
  return NextResponse.json({ ok: true, ...result });
}
