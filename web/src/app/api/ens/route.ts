/**
 * GET  /api/ens?name=vega  — check availability + metadata for an agent ENS name
 * POST /api/ens            — register {agentName}.talos.eth for a Talos agent
 *
 * ENS track: "Best ENS Integration for AI Agents" — $2,500
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  registerAgentEns,
  getAgentMetadata,
  isAgentEnsAvailable,
  buildAgentEnsName,
} from "@/lib/ens";
import { db } from "@/db";
import { tlsTalos } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  agentName: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  ownerAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),
  talosId: z.string().min(1),
  category: z.string().optional(),
  persona: z.string().optional(),
  serviceUrl: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const agentName = name.includes(".") ? name.split(".")[0] : name;
  const ensName = buildAgentEnsName(agentName);

  const [available, metadata] = await Promise.all([
    isAgentEnsAvailable(agentName),
    getAgentMetadata(ensName),
  ]);

  return NextResponse.json({ ensName, available, metadata });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const apiKey = auth?.replace("Bearer ", "").trim() ?? "";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Verify API key if provided (optional for public registration)
  if (apiKey && parsed.data.talosId) {
    const talos = await db.query.tlsTalos.findFirst({
      where: eq(tlsTalos.id, parsed.data.talosId),
      columns: { apiKey: true },
    });
    if (talos && talos.apiKey !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await registerAgentEns(parsed.data);

  if (!result) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ENS registration failed — check ENS_REGISTRAR_PRIVATE_KEY and ETH_SEPOLIA_RPC",
      },
      { status: 500 },
    );
  }

  // Persist ENS name in DB
  if (parsed.data.talosId) {
    await db
      .update(tlsTalos)
      .set({ ensName: result.ensName })
      .where(eq(tlsTalos.id, parsed.data.talosId))
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, ...result });
}
