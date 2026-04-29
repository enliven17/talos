import { NextRequest } from "next/server";
import { db } from "@/db";
import { tlsTalos, tlsPatrons, tlsRevenues } from "@/db/schema";
import { eq, and, sum } from "drizzle-orm";
import { sendA0GI } from "@/lib/og-chain";

const OPERATOR_ADDRESS = process.env.OG_OPERATOR_ADDRESS ?? "";

/**
 * POST /api/talos/:id/revenue/distribute
 *
 * Distribute accumulated treasury A0GI to Mitos holders proportionally.
 * Requires INITIA_OPERATOR_MNEMONIC (operator holds agent treasury for now).
 *
 * Body: { requesterAddress } — must be creator or operator
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { requesterAddress } = body as { requesterAddress?: string };

    if (!requesterAddress) {
      return Response.json({ error: "requesterAddress is required" }, { status: 400 });
    }

    const talos = await db.query.tlsTalos.findFirst({ where: eq(tlsTalos.id, id) });
    if (!talos) return Response.json({ error: "TALOS not found" }, { status: 404 });

    if (requesterAddress !== talos.creatorPublicKey && requesterAddress !== OPERATOR_ADDRESS) {
      return Response.json({ error: "Only the creator or operator can trigger distribution" }, { status: 403 });
    }

    const revenueResult = await db
      .select({ total: sum(tlsRevenues.amount) })
      .from(tlsRevenues)
      .where(eq(tlsRevenues.talosId, id));
    const totalRevenue = parseFloat(revenueResult[0]?.total ?? "0");

    if (totalRevenue <= 0) {
      return Response.json({ error: "No revenue to distribute" }, { status: 400 });
    }

    const patrons = await db
      .select()
      .from(tlsPatrons)
      .where(and(eq(tlsPatrons.talosId, id), eq(tlsPatrons.status, "active")));

    if (patrons.length === 0) {
      return Response.json({ error: "No active patrons to distribute to" }, { status: 400 });
    }

    const totalPulse = patrons.reduce((s, p) => s + p.pulseAmount, 0);
    if (totalPulse === 0) {
      return Response.json({ error: "Total Mitos held by patrons is 0" }, { status: 400 });
    }

    const investorShare = talos.investorShare ?? 25;
    const distributableAmount = (totalRevenue * investorShare) / 100;

    const operatorKey = process.env.OG_OPERATOR_PRIVATE_KEY;
    if (!operatorKey) {
      return Response.json({ error: "OG_OPERATOR_PRIVATE_KEY not configured" }, { status: 500 });
    }

    const transfers: { patron: string; amount: number; txHash: string }[] = [];
    const errors: { patron: string; error: string }[] = [];

    for (const patron of patrons) {
      const shareRatio = patron.pulseAmount / totalPulse;
      const patronAmountA0GI = Math.floor(distributableAmount * shareRatio * 1e6) / 1e6;

      if (patronAmountA0GI < 0.000001) continue;

      try {
        const { txHash } = await sendA0GI(operatorKey, patron.walletAddress, String(patronAmountA0GI));
        transfers.push({ patron: patron.walletAddress, amount: patronAmountA0GI, txHash });
      } catch (err: unknown) {
        const e = err as { message?: string };
        errors.push({ patron: patron.walletAddress, error: e?.message ?? "unknown" });
      }
    }

    return Response.json({
      success: true,
      totalRevenue,
      distributableAmount,
      investorSharePercent: investorShare,
      transfers,
      errors,
      message: `Distributed ${distributableAmount.toFixed(4)} A0GI (${investorShare}% of ${totalRevenue.toFixed(4)} treasury) to ${transfers.length} patrons`,
    });
  } catch (err) {
    console.error("[revenue/distribute]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/talos/:id/revenue/distribute
 * Preview distribution without executing
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const talos = await db.query.tlsTalos.findFirst({ where: eq(tlsTalos.id, id) });
    if (!talos) return Response.json({ error: "TALOS not found" }, { status: 404 });

    const [revenueResult, patrons] = await Promise.all([
      db.select({ total: sum(tlsRevenues.amount) }).from(tlsRevenues).where(eq(tlsRevenues.talosId, id)),
      db.select().from(tlsPatrons).where(and(eq(tlsPatrons.talosId, id), eq(tlsPatrons.status, "active"))),
    ]);

    const totalRevenue = parseFloat(revenueResult[0]?.total ?? "0");
    const investorShare = talos.investorShare ?? 25;
    const distributableAmount = (totalRevenue * investorShare) / 100;
    const totalPulse = patrons.reduce((s, p) => s + p.pulseAmount, 0);

    const breakdown = patrons.map((p) => ({
      walletAddress: p.walletAddress,
      pulseAmount: p.pulseAmount,
      sharePercent: totalPulse > 0 ? ((p.pulseAmount / totalPulse) * 100).toFixed(2) : "0",
      estimatedInit: totalPulse > 0
        ? ((distributableAmount * p.pulseAmount) / totalPulse).toFixed(6)
        : "0",
    }));

    return Response.json({
      totalRevenue,
      distributableAmount,
      investorSharePercent: investorShare,
      treasuryRetained: totalRevenue - distributableAmount,
      breakdown,
    });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
