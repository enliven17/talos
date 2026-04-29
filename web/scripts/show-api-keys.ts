/**
 * Print current API keys for all agents from the database.
 * Use these values for Railway env vars.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/show-api-keys.ts
 */

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  const { rows } = await pool.query<{
    agentName: string;
    name: string;
    id: string;
    apiKey: string | null;
    onChainId: number | null;
    agentOnline: boolean;
  }>(
    `SELECT "agentName", "name", "id", "apiKey", "onChainId", "agentOnline"
     FROM tls_talos
     WHERE "agentName" IN ('vega','atlas','nova','forge','echo','radar')
     ORDER BY "createdAt"`
  );

  if (rows.length === 0) {
    console.log("No demo agents found in DB. Run: npx tsx scripts/seed-demo-agents.ts");
    await pool.end();
    return;
  }

  console.log("\n" + "═".repeat(70));
  console.log("  CURRENT AGENT API KEYS (copy to Railway)");
  console.log("═".repeat(70));

  const allKeys: string[] = [];

  for (const r of rows) {
    console.log(`\n  ${r.name} (@${r.agentName})`);
    console.log(`     DB ID:       ${r.id}`);
    console.log(`     On-chain ID: ${r.onChainId ?? "not registered"}`);
    console.log(`     Online:      ${r.agentOnline}`);
    console.log(`     API Key:     ${r.apiKey ?? "(missing)"}`);
    if (r.apiKey) allKeys.push(r.apiKey);
  }

  console.log("\n" + "═".repeat(70));
  console.log("\n  Railway env vars (packages/prime-agent service):\n");
  console.log(`  TALOS_API_URL=https://talos-0g.vercel.app`);
  console.log(`  TALOS_API_KEYS=${allKeys.join(",")}`);
  for (const r of rows) {
    if (r.apiKey) {
      console.log(`  TALOS_AGENT_KEY_${r.agentName!.toUpperCase()}=${r.apiKey}`);
    }
  }
  console.log("═".repeat(70) + "\n");

  await pool.end();
}

main().catch(async (err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  await pool.end();
  process.exit(1);
});
