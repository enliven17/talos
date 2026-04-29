import { NextRequest } from "next/server";
import { db } from "@/db";
import { tlsTalos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signPaymentSchema, parseBody } from "@/lib/schemas";
import { randomBytes } from "crypto";

// POST /api/talos/:id/sign — Sign an A0GI payment transaction on 0G Chain.
// When agent secret is configured: signs a real EVM tx.
// When not configured (demo mode): returns a pseudo-token for job queue flow.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const talos = await db
      .select({
        agentWalletAddress: tlsTalos.agentWalletAddress,
        approvalThreshold: tlsTalos.approvalThreshold,
      })
      .from(tlsTalos)
      .where(eq(tlsTalos.id, id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!talos) {
      return Response.json({ error: "TALOS not found" }, { status: 404 });
    }

    const parsed = await parseBody(request, signPaymentSchema);
    if (parsed.error) return parsed.error;

    const { payee, amount } = parsed.data;
    const amountStr = typeof amount === "number" ? String(amount) : amount;
    const amountNum = Number(amountStr);

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return Response.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const threshold = Number(talos.approvalThreshold);
    if (amountNum > threshold) {
      return Response.json(
        {
          error: "Amount exceeds approval threshold",
          amountNum,
          threshold,
          message: "Create an approval request first",
        },
        { status: 403 },
      );
    }

    // If agent private key is configured, sign a real 0G Chain EVM tx
    const agentSecret = process.env[`TALOS_AGENT_SECRET_${id}`];
    if (agentSecret && talos.agentWalletAddress) {
      const { signA0GIPayment } = await import("@/lib/og-chain");
      const { paymentToken } = await signA0GIPayment(agentSecret, payee, amountStr);
      return Response.json({
        paymentHeader: `0g ${paymentToken}`,
        paymentToken,
        from: talos.agentWalletAddress,
        to: payee,
        amount: amountStr,
        currency: "A0GI",
        demo: false,
      });
    }

    // Demo mode — no secret configured, return a pseudo-token
    const pseudoToken = `demo:${randomBytes(24).toString("hex")}`;
    return Response.json({
      paymentHeader: `demo ${pseudoToken}`,
      paymentToken: pseudoToken,
      from: talos.agentWalletAddress ?? "unset",
      to: payee,
      amount: amountStr,
      currency: "A0GI",
      demo: true,
    });
  } catch (err) {
    console.error("Signing error:", err);
    return Response.json({ error: "Signing failed" }, { status: 500 });
  }
}
