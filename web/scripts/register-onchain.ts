/**
 * Register existing DB agents on Initia EVM chain.
 * Run after seed-demo-agents.ts when INITIA_OPERATOR_SECRET wasn't set.
 *
 * Usage:
 *   cd web
 *   INITIA_OPERATOR_SECRET=0x... npx tsx scripts/register-onchain.ts
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { createTalosOnChain, registerNameOnChain } from "../src/lib/og-chain";

const __dir = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dir, "../.env.local");

const AGENT_NAMES = ["vega", "atlas", "nova", "forge", "echo", "radar"];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")
    ? { rejectUnauthorized: false }
    : undefined,
});
const db = drizzle(pool, { schema });

function updateEnv(key: string, value: string): void {
  let content = "";
  try { content = readFileSync(ENV_PATH, "utf8"); } catch { /* */ }
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  writeFileSync(ENV_PATH, content, "utf8");
}

async function main() {
  console.log("▶  Registering agents on Initia EVM chain...\n");

  for (const name of AGENT_NAMES) {
    const [agent] = await db
      .select()
      .from(schema.tlsTalos)
      .where(eq(schema.tlsTalos.agentName, name))
      .limit(1);

    if (!agent) {
      console.log(`  ⚠  @${name} not in DB, skipping`);
      continue;
    }

    if (agent.onChainId !== null) {
      console.log(`  ⏭  @${name} already on chain (ID: ${agent.onChainId}), skipping`);
      continue;
    }

    console.log(`  ⛓  Registering @${name} (${agent.name})...`);
    try {
      const result = await createTalosOnChain({
        name: agent.name,
        category: agent.category,
        description: agent.description,
        creatorAddr: agent.creatorPublicKey ?? "init1egqdsywm6z3yrh6lzqpcr367kfzz58gk3zfd89",
        approvalThreshold: Number(agent.approvalThreshold ?? 10),
        gtmBudget: Number(agent.gtmBudget ?? 200),
        totalSupply: agent.totalSupply ?? 1_000_000,
        tokenSymbol: agent.tokenSymbol ?? name.toUpperCase(),
      });

      if (!result) {
        console.log(`     ✗ createTalosOnChain returned null`);
        continue;
      }

      const onChainId = Number(result.onChainId);
      await db
        .update(schema.tlsTalos)
        .set({ onChainId })
        .where(eq(schema.tlsTalos.id, agent.id));

      console.log(`     ✓ On-chain ID: ${onChainId} (tx: ${result.txHash})`);

      // Register name
      const nameResult = await registerNameOnChain(result.onChainId, name);
      if (nameResult) {
        console.log(`     ✓ Name registered: @${name}`);
      }

      updateEnv(`TALOS_ONCHAIN_ID_${name.toUpperCase()}`, String(onChainId));
    } catch (err) {
      console.log(`     ✗ ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n✅ Chain registration complete.\n");
  await pool.end();
}

main().catch(async (err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  await pool.end();
  process.exit(1);
});
