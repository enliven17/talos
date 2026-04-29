import { NextRequest } from "next/server";
import { db } from "@/db";
import { tlsCommerceJobs } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/talos/:id/jobs?jobId=xxx  or  ?txHash=xxx
 * Poll job status — used by agents and clients after submitting via /service.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const txHash = searchParams.get("txHash");

  if (!jobId && !txHash) {
    return Response.json({ error: "Provide jobId or txHash" }, { status: 400 });
  }

  try {
    const job = jobId
      ? await db.select().from(tlsCommerceJobs)
          .where(eq(tlsCommerceJobs.id, jobId)).limit(1).then(r => r[0] ?? null)
      : await db.select().from(tlsCommerceJobs)
          .where(eq(tlsCommerceJobs.txHash, txHash!)).limit(1).then(r => r[0] ?? null);

    if (!job || job.talosId !== id) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    return Response.json({
      jobId: job.id,
      status: job.status,
      serviceName: job.serviceName,
      result: job.result,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
