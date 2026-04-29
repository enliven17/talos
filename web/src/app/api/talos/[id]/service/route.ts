import { NextRequest } from "next/server";
import { db } from "@/db";
import { tlsTalos, tlsCommerceServices, tlsCommerceJobs, tlsRevenues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAgentApiKey } from "@/lib/auth";
import { verifyA0GIPayment, broadcastA0GIPayment, verifyTxByHash } from "@/lib/og-chain";
import { fulfillInstant } from "@/lib/fulfillment";
import { registerServiceSchema, parseBody } from "@/lib/schemas";

// GET /api/talos/:id/service — Returns 402 with payment details (0G Chain)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const [service, talos] = await Promise.all([
      db
        .select()
        .from(tlsCommerceServices)
        .where(eq(tlsCommerceServices.talosId, id))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({ agentWalletAddress: tlsTalos.agentWalletAddress })
        .from(tlsTalos)
        .where(eq(tlsTalos.id, id))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

    if (!service) {
      return Response.json({ error: "No service registered for this TALOS" }, { status: 404 });
    }

    const payee = service.walletAddress || talos?.agentWalletAddress;
    if (!payee) {
      return Response.json({ error: "No payment address configured for this TALOS" }, { status: 500 });
    }

    return Response.json(
      {
        price: Number(service.price),
        currency: "A0GI",
        payee,
        chains: ["0g-galileo"],
        network: "0g-galileo",
        chainId: 16601,
        serviceName: service.serviceName,
        description: service.description,
        fulfillmentMode: service.fulfillmentMode,
        talosId: id,
      },
      { status: 402 },
    );
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/talos/:id/service — Submit 0G Chain payment + create commerce job
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // Resolve requester
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let requesterId = bearerToken ?? "web";
    if (bearerToken?.startsWith("tak_")) {
      const agentTalos = await db
        .select({ id: tlsTalos.id })
        .from(tlsTalos)
        .where(eq(tlsTalos.apiKey, bearerToken))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (agentTalos) requesterId = agentTalos.id;
    }

    const requestBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const [service, providerTalos] = await Promise.all([
      db.select().from(tlsCommerceServices).where(eq(tlsCommerceServices.talosId, id)).limit(1).then((r) => r[0] ?? null),
      db.select({ agentWalletAddress: tlsTalos.agentWalletAddress }).from(tlsTalos).where(eq(tlsTalos.id, id)).limit(1).then((r) => r[0] ?? null),
    ]);

    if (!service) {
      return Response.json({ error: "No service registered for this TALOS" }, { status: 404 });
    }

    const expectedPayee = service.walletAddress || providerTalos?.agentWalletAddress;
    if (!expectedPayee) {
      return Response.json({ error: "No payment address configured for this TALOS" }, { status: 500 });
    }

    // Payment modes:
    // A) txHash in body — user signed + broadcast via MetaMask, server verifies on-chain
    // B) X-PAYMENT header — agent pre-signed raw EVM tx (agent-to-agent), server broadcasts
    const bodyTxHash = typeof requestBody.txHash === "string" ? requestBody.txHash : null;
    const paymentHeader = request.headers.get("x-payment");

    if (!bodyTxHash && !paymentHeader) {
      return Response.json(
        { error: "Provide txHash in body (web UI) or X-PAYMENT header (agent)" },
        { status: 400 },
      );
    }

    let txHash: string;
    let paymentToken: string;

    if (bodyTxHash) {
      // Mode A: verify already-broadcast tx on 0G Chain
      paymentToken = bodyTxHash;

      const existingJob = await db
        .select({ id: tlsCommerceJobs.id })
        .from(tlsCommerceJobs)
        .where(eq(tlsCommerceJobs.paymentSig, paymentToken))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (existingJob) {
        return Response.json({ error: "Payment already used (replay detected)" }, { status: 409 });
      }

      const verified = await verifyTxByHash(bodyTxHash, expectedPayee, String(service.price));
      if (!verified) {
        return Response.json({ error: "On-chain payment not found or insufficient amount" }, { status: 402 });
      }
      txHash = bodyTxHash;
    } else {
      // Mode B: agent pre-signed raw EVM tx
      const rawToken = paymentHeader!.startsWith("0g ")
        ? paymentHeader!.slice(3).trim()
        : paymentHeader!.trim();
      paymentToken = rawToken;

      // Allow demo tokens (no-secret mode)
      if (rawToken.startsWith("demo:")) {
        txHash = rawToken;
      } else {
        const existingJob = await db
          .select({ id: tlsCommerceJobs.id })
          .from(tlsCommerceJobs)
          .where(eq(tlsCommerceJobs.paymentSig, paymentToken))
          .limit(1)
          .then((r) => r[0] ?? null);
        if (existingJob) {
          return Response.json({ error: "Payment already used (replay detected)" }, { status: 409 });
        }

        const verified = await verifyA0GIPayment(paymentToken, expectedPayee, String(service.price));
        if (!verified) {
          return Response.json({ error: "Invalid or insufficient 0G Chain payment" }, { status: 402 });
        }

        try {
          const result = await broadcastA0GIPayment(paymentToken);
          txHash = result.txHash;
        } catch (settleErr) {
          console.error("0G payment broadcast failed:", settleErr);
          return Response.json({ error: "On-chain payment broadcast failed" }, { status: 502 });
        }
      }
    }

    const payload = (requestBody.payload ?? requestBody) as Record<string, unknown>;

    if (service.fulfillmentMode === "instant") {
      let result: Record<string, unknown>;
      try {
        result = await fulfillInstant(service.serviceName, payload ?? {});
      } catch (fulfillErr) {
        console.error("Service fulfillment failed:", fulfillErr);
        return Response.json({ error: "Service fulfillment failed" }, { status: 502 });
      }

      const [job] = await db.transaction(async (tx) => {
        const [job] = await tx
          .insert(tlsCommerceJobs)
          .values({
            talosId: id,
            requesterTalosId: requesterId,
            serviceName: service.serviceName,
            payload: payload ?? undefined,
            result,
            paymentSig: paymentToken,
            txHash,
            amount: service.price,
            status: "completed",
          })
          .returning();

        await tx.insert(tlsRevenues).values({
          talosId: id,
          amount: service.price,
          currency: "A0GI",
          source: "commerce",
          txHash,
        });

        return [job];
      });

      return Response.json(
        { id: job.id, jobId: job.id, status: "completed", result, txHash },
        { status: 201 },
      );
    }

    const [job] = await db
      .insert(tlsCommerceJobs)
      .values({
        talosId: id,
        requesterTalosId: requesterId,
        serviceName: service.serviceName,
        payload: payload ?? undefined,
        paymentSig: paymentToken,
        txHash,
        amount: service.price,
        status: "pending",
      })
      .returning();

    return Response.json({ id: job.id, jobId: job.id, status: "pending", txHash }, { status: 201 });
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    if (e?.code === "23505" && String(e?.constraint ?? "").includes("paymentSig")) {
      return Response.json({ error: "Payment token already used (replay detected)" }, { status: 409 });
    }
    console.error("Service POST error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/talos/:id/service — Register or update commerce service (upsert)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const auth = await verifyAgentApiKey(request, id);
    if (!auth.ok) return auth.response;

    const parsed = await parseBody(request, registerServiceSchema);
    if (parsed.error) return parsed.error;

    const { serviceName, description, price, walletAddress, chains, fulfillmentMode } = parsed.data;

    const talos = await db
      .select({ agentWalletAddress: tlsTalos.agentWalletAddress })
      .from(tlsTalos)
      .where(eq(tlsTalos.id, id))
      .limit(1)
      .then((r) => r[0] ?? null);

    const serviceWalletAddress = walletAddress || talos?.agentWalletAddress;
    if (!serviceWalletAddress) {
      return Response.json(
        { error: "walletAddress is required (no agent wallet available as fallback)" },
        { status: 400 },
      );
    }

    const existing = await db
      .select({ id: tlsCommerceServices.id })
      .from(tlsCommerceServices)
      .where(eq(tlsCommerceServices.talosId, id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (existing) {
      const [updated] = await db
        .update(tlsCommerceServices)
        .set({
          serviceName,
          description: description ?? null,
          price: String(price),
          walletAddress: serviceWalletAddress,
          chains: chains ?? ["0g-galileo"],
          fulfillmentMode: fulfillmentMode ?? "async",
        })
        .where(eq(tlsCommerceServices.talosId, id))
        .returning();
      return Response.json(updated);
    }

    const [service] = await db
      .insert(tlsCommerceServices)
      .values({
        talosId: id,
        serviceName,
        description: description ?? null,
        price: String(price),
        walletAddress: serviceWalletAddress,
        chains: chains ?? ["0g-galileo"],
        fulfillmentMode: fulfillmentMode ?? "async",
      })
      .returning();

    return Response.json(service, { status: 201 });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
