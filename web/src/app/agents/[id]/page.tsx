export const dynamic = 'force-dynamic';

import { db } from "@/db";
import {
  tlsTalos,
  tlsPatrons,
  tlsActivities,
  tlsRevenues,
  tlsCommerceServices,
  tlsCommerceJobs,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TalosDetailClient } from "./detail-client";

export default async function TalosDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    talosRows,
    patrons,
    activities,
    revenues,
    commerceServiceRows,
    recentJobs,
    [jobStatsRow],
  ] = await Promise.all([
    db.select().from(tlsTalos).where(eq(tlsTalos.id, id)).limit(1),
    db.select().from(tlsPatrons).where(eq(tlsPatrons.talosId, id)),
    db
      .select()
      .from(tlsActivities)
      .where(eq(tlsActivities.talosId, id))
      .orderBy(desc(tlsActivities.createdAt))
      .limit(20),
    db
      .select()
      .from(tlsRevenues)
      .where(eq(tlsRevenues.talosId, id))
      .orderBy(desc(tlsRevenues.createdAt))
      .limit(20),
    db
      .select()
      .from(tlsCommerceServices)
      .where(eq(tlsCommerceServices.talosId, id))
      .limit(1),
    db
      .select()
      .from(tlsCommerceJobs)
      .where(eq(tlsCommerceJobs.talosId, id))
      .orderBy(desc(tlsCommerceJobs.createdAt))
      .limit(10),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${tlsCommerceJobs.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${tlsCommerceJobs.status} = 'failed')::int`,
        pending: sql<number>`count(*) filter (where ${tlsCommerceJobs.status} = 'pending')::int`,
        totalRevenue: sql<number>`coalesce(sum(${tlsCommerceJobs.amount}::numeric) filter (where ${tlsCommerceJobs.status} = 'completed'), 0)::float`,
        jobsToday: sql<number>`count(*) filter (where ${tlsCommerceJobs.createdAt} >= ${todayStart})::int`,
      })
      .from(tlsCommerceJobs)
      .where(eq(tlsCommerceJobs.talosId, id)),
  ]);

  const talos = talosRows[0];
  const commerceService = commerceServiceRows[0] ?? null;

  if (!talos) notFound();

  const totalRevenue = revenues.reduce(
    (sum, r) => sum + Number(r.amount),
    0
  );

  // Aggregate revenue by month
  const revenueByMonth = new Map<string, number>();
  for (const r of revenues) {
    const d = new Date(r.createdAt);
    const key = `${d.toLocaleString("en-US", { month: "short" })} ${String(d.getFullYear()).slice(-2)}`;
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(r.amount));
  }
  const revenueHistory = Array.from(revenueByMonth.entries())
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }))
    .slice(-6);

  // Agent activity stats (today)
  const todayActivities = activities.filter(
    (a) => new Date(a.createdAt) >= todayStart
  );
  const agentStats = {
    postsToday: todayActivities.filter((a) => a.type === "post").length,
    repliesToday: todayActivities.filter((a) => a.type === "reply").length,
    researchesToday: todayActivities.filter((a) => a.type === "research").length,
  };

  const successRate = jobStatsRow.total > 0
    ? Math.round((jobStatsRow.completed / jobStatsRow.total) * 100)
    : null;

  // Serialize for client
  const data = {
    id: talos.id,
    name: talos.name,
    agentName: talos.agentName,
    category: talos.category,
    description: talos.description,
    status: talos.status,
    tokenCode: talos.tokenCode ?? "",
    tokenSymbol: talos.tokenSymbol ?? "MITOS",
    pulsePrice: `$${Number(talos.pulsePrice).toFixed(2)}`,
    totalSupply: talos.totalSupply,
    creatorPublicKey: talos.creatorPublicKey,
    persona: talos.persona ?? "",
    targetAudience: talos.targetAudience ?? "",
    channels: talos.channels,
    approvalThreshold: Number(talos.approvalThreshold),
    gtmBudget: Number(talos.gtmBudget),
    minPatronPulse: talos.minPatronPulse,
    investorShare: talos.investorShare,
    agentOnline: talos.agentOnline,
    agentLastSeen: talos.agentLastSeen?.toISOString() ?? null,
    agentWalletAddress: talos.agentWalletAddress ?? null,
    onChainId: talos.onChainId ?? null,
    onChainTxHash: talos.onChainTxHash ?? null,
    ensName: talos.ensName ?? null,
    ensTxHash: talos.ensTxHash ?? null,
    createdAt: talos.createdAt.toISOString().split("T")[0],
    revenue: `$${totalRevenue.toLocaleString()}`,
    patronCount: patrons.length,
    patrons: patrons.map((p) => ({
      walletAddress: p.walletAddress,
      role: p.role,
      pulseAmount: p.pulseAmount,
      share: Number(p.share),
      status: p.status,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      type: a.type,
      content: a.content,
      channel: a.channel,
      status: a.status,
      timestamp: getRelativeTime(a.createdAt),
    })),
    revenueHistory,
    agentStats,
    // Commerce
    service: commerceService
      ? {
          name: commerceService.serviceName,
          description: commerceService.description,
          price: Number(commerceService.price),
          currency: commerceService.currency,
          walletAddress: commerceService.walletAddress,
          chains: commerceService.chains,
        }
      : null,
    jobStats: {
      total: jobStatsRow.total,
      completed: jobStatsRow.completed,
      failed: jobStatsRow.failed,
      pending: jobStatsRow.pending,
      successRate,
      totalRevenue: jobStatsRow.totalRevenue,
      jobsToday: jobStatsRow.jobsToday,
    },
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      serviceName: j.serviceName,
      status: j.status,
      amount: Number(j.amount),
      createdAt: getRelativeTime(j.createdAt),
    })),
  };

  return <TalosDetailClient talos={data} />;
}

function getRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
