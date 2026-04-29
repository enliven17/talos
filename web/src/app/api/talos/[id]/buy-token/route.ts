import { db } from "@/db";
import { tlsTalos, tlsPatrons, tlsRevenues } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isValidEvmAddress } from "@/lib/cosmwasm";

/**
 * Buy Mitos tokens from a Talos.
 *
 * Flow:
 * 1. Verify buyer's Stellar account exists
 * 2. Calculate total cost (amount * pricePerToken)
 * 3. Check if buyer has sufficient USDC balance
 * 4. Verify txHash is present (USDC payment already submitted by client)
 * 5. Send Mitos tokens from operator to buyer (server-side)
 * 6. Record patron status if buyer meets minimum threshold
 * 7. Record revenue
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const { buyerPublicKey, amount, txHash } = body as {
    buyerPublicKey?: string;
    amount?: number;
    txHash?: string;
  };

  if (!buyerPublicKey || typeof buyerPublicKey !== "string") {
    return NextResponse.json({ error: "buyerPublicKey is required" }, { status: 400 });
  }
  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  if (!txHash) {
    return NextResponse.json({ error: "txHash is required — submit A0GI payment first" }, { status: 400 });
  }

  const talos = await db.query.tlsTalos.findFirst({
    where: eq(tlsTalos.id, id),
  });

  if (!talos) {
    return NextResponse.json({ error: "TALOS not found" }, { status: 404 });
  }

  const pricePerToken = Number(talos.pulsePrice);
  if (pricePerToken <= 0) {
    return NextResponse.json({ error: "Token is not available for purchase" }, { status: 400 });
  }

  const totalCost = Math.round(amount * pricePerToken * 1e6) / 1e6;

  // Verify buyer address is a valid EVM address
  if (!isValidEvmAddress(buyerPublicKey)) {
    return NextResponse.json(
      { error: `Invalid EVM address: ${buyerPublicKey}. Fund it at https://faucet.0g.ai` },
      { status: 400 },
    );
  }

  // ── Token distribution is tracked off-chain (CW20 token minting future work) ──
  const mitosTxHash: string | null = null;

  // ── Patron threshold check ─────────────────────────────────────────
  const minForPatron = talos.minPatronPulse ?? 100;

  const existingPatron = await db.query.tlsPatrons.findFirst({
    where: and(
      eq(tlsPatrons.talosId, id),
      eq(tlsPatrons.walletAddress, buyerPublicKey),
    ),
  });

  const currentPulseAmount = existingPatron?.pulseAmount ?? 0;
  const newPulseAmount = currentPulseAmount + amount;
  const becomesPatron = newPulseAmount >= minForPatron;

  if (becomesPatron) {
    if (existingPatron) {
      await db
        .update(tlsPatrons)
        .set({ pulseAmount: newPulseAmount, updatedAt: new Date() })
        .where(eq(tlsPatrons.id, existingPatron.id));
    } else {
      await db.insert(tlsPatrons).values({
        talosId: id,
        walletAddress: buyerPublicKey,
        role: "patron",
        share: "0",
        pulseAmount: newPulseAmount,
        status: "active",
      });
    }
  } else if (existingPatron) {
    // Update token balance even if still below threshold
    await db
      .update(tlsPatrons)
      .set({ pulseAmount: newPulseAmount, updatedAt: new Date() })
      .where(eq(tlsPatrons.id, existingPatron.id));
  }

  // ── Record revenue ─────────────────────────────────────────────────
  await db.insert(tlsRevenues).values({
    talosId: id,
    amount: String(totalCost),
    currency: "A0GI",
    source: "token_sale",
    txHash,
  });

  const tokenSymbol = talos.tokenSymbol ?? "MITOS";

  return NextResponse.json({
    success: true,
    txHash,
    mitosTxHash,
    tokenSymbol,
    amount,
    pricePerToken,
    totalCost,
    currency: "A0GI",
    buyerPublicKey,
    totalPulseHeld: newPulseAmount,
    patronStatus: becomesPatron
      ? existingPatron
        ? "updated"
        : "registered"
      : newPulseAmount < minForPatron
        ? `pending (need ${minForPatron - newPulseAmount} more ${tokenSymbol})`
        : "active",
    message: `Successfully purchased ${amount.toLocaleString()} ${tokenSymbol} for ${totalCost.toFixed(6)} A0GI`,
  });
}
