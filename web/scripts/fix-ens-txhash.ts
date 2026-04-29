/**
 * Re-register ENS for agents that have ensName but no ensTxHash.
 * Also updates register-ens-agents to cover this case going forward.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { isNull, isNotNull, and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { registerAgentEns } from "../src/lib/ens";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "") ? { rejectUnauthorized: false } : undefined,
});
const db = drizzle(pool, { schema });

async function main() {
  // Find agents with ensName but missing ensTxHash
  const agents = await db.select({
    id: schema.tlsTalos.id,
    agentName: schema.tlsTalos.agentName,
    agentWalletAddress: schema.tlsTalos.agentWalletAddress,
    category: schema.tlsTalos.category,
    persona: schema.tlsTalos.persona,
    ensName: schema.tlsTalos.ensName,
  })
  .from(schema.tlsTalos)
  .where(and(isNotNull(schema.tlsTalos.ensName), isNull(schema.tlsTalos.ensTxHash)));

  console.log(`Found ${agents.length} agents with ensName but no ensTxHash\n`);

  for (const agent of agents) {
    if (!agent.agentName || !agent.agentWalletAddress) continue;
    console.log(`→ Re-registering ${agent.ensName}...`);

    const result = await registerAgentEns({
      agentName: agent.agentName,
      ownerAddress: agent.agentWalletAddress,
      talosId: agent.id,
      category: agent.category ?? undefined,
      persona: agent.persona ?? undefined,
    });

    if (result) {
      await db.update(schema.tlsTalos)
        .set({ ensName: result.ensName, ensTxHash: result.txHash })
        .where(eq(schema.tlsTalos.id, agent.id));
      console.log(`  ✅ ${result.ensName} — tx: ${result.txHash}`);
    } else {
      console.log(`  ❌ Failed`);
    }
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch(async e => { console.error(e.message); await pool.end(); process.exit(1); });
