/**
 * POST /api/og-storage  — checkpoint agent state or memory to 0G Storage
 * GET  /api/og-storage?rootHash=...  — download content by root hash
 *
 * 0G Storage track: dAIOS persistent agent memory
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tlsTalos } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  storeAgentState,
  appendAgentMemory,
  downloadFromStorage,
} from "@/lib/og-storage";

export const dynamic = "force-dynamic";

const storeSchema = z.object({
  talosId: z.string().min(1),
  type: z.enum(["state", "memory"]),
  data: z.record(z.string(), z.unknown()),
});

export async function GET(req: NextRequest) {
  const rootHash = req.nextUrl.searchParams.get("rootHash");
  if (!rootHash) {
    return NextResponse.json({ error: "rootHash required" }, { status: 400 });
  }

  const content = await downloadFromStorage(rootHash);
  if (!content) {
    return NextResponse.json({ error: "Not found or download failed" }, { status: 404 });
  }

  try {
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json({ raw: content });
  }
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

  const parsed = storeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { talosId, type, data } = parsed.data;

  // Verify the API key belongs to this Talos
  const talos = await db.query.tlsTalos.findFirst({
    where: eq(tlsTalos.id, talosId),
    columns: { id: true, apiKey: true, agentName: true, name: true },
  });
  if (!talos || talos.apiKey !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rootHash: string | null = null;

  if (type === "state") {
    rootHash = await storeAgentState({
      talosId,
      agentName: talos.agentName ?? talos.name,
      status: "active",
      lastSeen: Date.now(),
      cycleCount: (data.cycleCount as number) ?? 0,
      totalRevenue: (data.totalRevenue as number) ?? 0,
      activeJob: (data.activeJob as string | null) ?? null,
      metadata: data,
    });
  } else {
    rootHash = await appendAgentMemory({
      timestamp: Date.now(),
      type: (data.type as "activity" | "commerce" | "research" | "decision") ?? "activity",
      content: (data.content as string) ?? JSON.stringify(data),
      talosId,
      metadata: data,
    });
  }

  return NextResponse.json({ ok: true, rootHash, stored: !!rootHash });
}
