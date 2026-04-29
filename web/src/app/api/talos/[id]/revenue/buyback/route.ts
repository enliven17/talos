import { NextRequest } from "next/server";
import { db } from "@/db";
import { tlsTalos, tlsRevenues } from "@/db/schema";
import { and, eq, sum } from "drizzle-orm";
import { getA0GIBalance } from "@/lib/og-chain";
import { formatEther } from "viem";

const OPERATOR_ADDRESS = process.env.OG_OPERATOR_ADDRESS ?? "";

/**
 * POST /api/talos/:id/revenue/buyback
 *
 * Treasury buyback: records a buyback event in the DB.
 * On Initia, CW20 token burning is tracked via contract events (future work).
 *
 * Body: { requesterAddress, initAmount, mitosAmount }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { requesterAddress, initAmount, mitosAmount } = body as {
      requesterAddress?: string;
      initAmount?: number;
      mitosAmount?: number;
    };

    if (!requesterAddress) {
      return Response.json({ error: "requesterAddress is required" }, { status: 400 });
    }
    if (!initAmount || initAmount <= 0) {
      return Response.json({ error: "initAmount must be positive" }, { status: 400 });
    }
    if (!mitosAmount || mitosAmount <= 0) {
      return Response.json({ error: "mitosAmount must be positive" }, { status: 400 });
    }

    const talos = await db.query.tlsTalos.findFirst({ where: eq(tlsTalos.id, id) });
    if (!talos) return Response.json({ error: "TALOS not found" }, { status: 404 });

    if (requesterAddress !== talos.creatorPublicKey && requesterAddress !== OPERATOR_ADDRESS) {
      return Response.json({ error: "Only creator or operator can trigger buyback" }, { status: 403 });
    }

    // Record as negative revenue (treasury expense)
    await db.insert(tlsRevenues).values({
      talosId: id,
      amount: String(-initAmount),
      currency: "A0GI",
      source: "buyback",
      txHash: null,
    });

    return Response.json({
      success: true,
      mitosBurned: mitosAmount,
      initSpent: initAmount,
      message: `Buyback recorded: ${mitosAmount.toLocaleString()} ${talos.tokenSymbol ?? "MITOS"} tokens marked for burn.`,
    });
  } catch (err: any) {
    console.error("[buyback]", err?.message ?? err);
    return Response.json({ error: err?.message ?? "Buyback failed" }, { status: 500 });
  }
}

/**
 * GET /api/talos/:id/revenue/buyback
 * Preview: treasury stats
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const talos = await db.query.tlsTalos.findFirst({ where: eq(tlsTalos.id, id) });
    if (!talos) return Response.json({ error: "TALOS not found" }, { status: 404 });

    const [revenueResult, buybackResult] = await Promise.all([
      db.select({ total: sum(tlsRevenues.amount) }).from(tlsRevenues).where(eq(tlsRevenues.talosId, id)),
      db.select({ total: sum(tlsRevenues.amount) })
        .from(tlsRevenues)
        .where(and(eq(tlsRevenues.talosId, id), eq(tlsRevenues.source, "buyback"))),
    ]);

    const totalRevenue = parseFloat(revenueResult[0]?.total ?? "0");
    const totalBuyback = Math.abs(parseFloat(buybackResult[0]?.total ?? "0"));
    const treasuryShare = talos.treasuryShare ?? 15;
    const investorShare = talos.investorShare ?? 25;
    const treasuryBalance = (totalRevenue * treasuryShare) / 100;

    // Operator A0GI balance
    let operatorInitBalance = "0";
    if (OPERATOR_ADDRESS) {
      try {
        const balWei = await getA0GIBalance(OPERATOR_ADDRESS);
        operatorInitBalance = formatEther(balWei);
      } catch { /* offline */ }
    }

    return Response.json({
      totalRevenue,
      treasuryBalance,
      treasurySharePercent: treasuryShare,
      investorSharePercent: investorShare,
      totalBuybackExecuted: totalBuyback,
      operatorInitBalance,
      tokenSymbol: talos.tokenSymbol ?? "MITOS",
      circulatingSupply: talos.totalSupply,
    });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
