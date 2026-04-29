/**
 * Register ENS subnames for all agents that don't have one yet.
 * Usage: npx tsx scripts/register-ens-agents.ts
 */

import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { isNull, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { registerAgentEns } from "../src/lib/ens";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")
    ? { rejectUnauthorized: false }
    : undefined,
});
const db = drizzle(pool, { schema });

async function main() {
  const agents = await db
    .select({
      id: schema.tlsTalos.id,
      agentName: schema.tlsTalos.agentName,
      agentWalletAddress: schema.tlsTalos.agentWalletAddress,
      category: schema.tlsTalos.category,
      persona: schema.tlsTalos.persona,
      ensName: schema.tlsTalos.ensName,
    })
    .from(schema.tlsTalos)
    .where(isNull(schema.tlsTalos.ensTxHash)); // covers both no-name and missing tx hash

  console.log(`Registering ENS for ${agents.length} agents without ENS names...\n`);

  for (const agent of agents) {
    if (!agent.agentName || !agent.agentWalletAddress) {
      console.log(`  ⏭  Skipping ${agent.id} — no agentName or wallet`);
      continue;
    }

    console.log(`→ ${agent.agentName}.talos.eth`);
    const result = await registerAgentEns({
      agentName: agent.agentName,
      ownerAddress: agent.agentWalletAddress,
      talosId: agent.id,
      category: agent.category,
      persona: agent.persona ?? undefined,
    });

    if (result) {
      await db
        .update(schema.tlsTalos)
        .set({ ensName: result.ensName, ensTxHash: result.txHash })
        .where(eq(schema.tlsTalos.id, agent.id));
      console.log(`  ✅ ${result.ensName}`);
      console.log(`     tx: ${result.txHash}`);
    } else {
      console.log(`  ❌ Failed for ${agent.agentName}`);
    }
    console.log();
  }

  await pool.end();
  console.log("Done.");
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await pool.end();
  process.exit(1);
});
