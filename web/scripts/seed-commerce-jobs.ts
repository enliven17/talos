/**
 * Backfill tls_commerce_jobs from already-seeded demo activity.
 * Uses the same 10 scenarios and tx hashes from seed-demo-activity.
 */

import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")
    ? { rejectUnauthorized: false }
    : undefined,
});
const db = drizzle(pool, { schema });

async function getTalosId(agentName: string) {
  const rows = await db.select({ id: schema.tlsTalos.id })
    .from(schema.tlsTalos).where(eq(schema.tlsTalos.agentName, agentName)).limit(1);
  return rows[0]?.id ?? null;
}

// The 10 transactions from seed-demo-activity with their real tx hashes
const JOBS = [
  { buyer: "atlas", seller: "vega",  service: "audience_insight",    amount: "0.005", txHash: "0x9962afe24a1d2917e124f7f67c45943de1cff8421d5e8af2c0c7dae811b2af40" },
  { buyer: "forge", seller: "nova",  service: "competitor_analysis", amount: "0.008", txHash: "0x516fd7d50c11fe2f4b6854cd1be26851a941ad0a2de6efd240affd86ed13ac2e" },
  { buyer: "echo",  seller: "atlas", service: "trend_research",      amount: "0.005", txHash: "0x37cef775207738b7092e16363bc62851d35eca73deebabbaa0fc37f06e47258b" },
  { buyer: "radar", seller: "echo",  service: "copywriting",         amount: "0.006", txHash: "0xa1531d63e8661ca61f701eae6108ea1db1d9a41cae636443bf4e059a4aa87bcd" },
  { buyer: "nova",  seller: "vega",  service: "audience_insight",    amount: "0.005", txHash: "0xdb3908128678846aa582f9834207eeadf7202e580d3f248ea7fae2df730fa351" },
  { buyer: "vega",  seller: "forge", service: "lead_generation",     amount: "0.010", txHash: "0xcf7ed93282f780f9957929b78f756f4104dbdc55f9592e9bd019fbe5b66f0907" },
  { buyer: "atlas", seller: "radar", service: "intent_signal",       amount: "0.010", txHash: "0xab309ffb1959863c6b7b65f37ce9f13f6f6d4c248d64ea10e98e4867b8fb5c0d" },
  { buyer: "echo",  seller: "nova",  service: "competitor_analysis", amount: "0.008", txHash: "0x979e8f1d59087655d52badfff2fe810ee26382d7b429cc348e3200ac4706dd3f" },
  { buyer: "vega",  seller: "echo",  service: "copywriting",         amount: "0.006", txHash: "0x9ec69a973a4d399a7913b3e6a710627df6bf473ff2def1d87e7df57549e41246" },
  { buyer: "radar", seller: "atlas", service: "trend_research",      amount: "0.005", txHash: "0x0ce5e2a8b22ca70ba2844f27ca5f1b94a76de78e2e9e8b2c85927d6d22d60413" },
];

async function main() {
  console.log("Inserting 10 commerce jobs into tls_commerce_jobs...\n");

  for (let i = 0; i < JOBS.length; i++) {
    const j = JOBS[i];
    const [buyerId, sellerId] = await Promise.all([getTalosId(j.buyer), getTalosId(j.seller)]);
    if (!buyerId || !sellerId) { console.log(`⚠  Skip ${j.buyer}→${j.seller}: ID not found`); continue; }

    await db.insert(schema.tlsCommerceJobs).values({
      talosId: sellerId,
      requesterTalosId: buyerId,
      serviceName: j.service,
      status: "completed",
      amount: j.amount,
      txHash: j.txHash,
      payload: { buyer: j.buyer, axl: true },
      result: { status: "fulfilled", message: `${j.service} delivered via AXL` },
    });

    console.log(`  ✅ [${i + 1}] ${j.buyer} → ${j.seller} | ${j.service} | ${j.amount} A0GI`);
  }

  console.log("\nDone. Global activity feed now has 10 transactions.");
  await pool.end();
}

main().catch(async e => { console.error(e.message); await pool.end(); process.exit(1); });
