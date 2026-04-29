/**
 * Seed 6 demo TALOS agents — DB + 0G Galileo chain + ENS subnames.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/seed-demo-agents.ts
 *
 * Env: DATABASE_URL, OG_OPERATOR_PRIVATE_KEY, NEXT_PUBLIC_TALOS_REGISTRY_CONTRACT,
 *      NEXT_PUBLIC_TALOS_NAME_SERVICE_CONTRACT, ENS_REGISTRAR_PRIVATE_KEY (optional)
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import * as schema from "../src/db/schema";
import {
  createAgentKeypair,
  createTalosOnChain,
  registerNameOnChain,
} from "../src/lib/og-chain";

const __dir = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dir, "../.env.local");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")
    ? { rejectUnauthorized: false }
    : undefined,
});
const db = drizzle(pool, { schema });

function generateApiKey(): string {
  return `tak_${createId()}${createId()}`;
}

function appendEnv(key: string, value: string): void {
  let content = "";
  try { content = readFileSync(ENV_PATH, "utf8"); } catch { /**/ }
  const regex = new RegExp(`^${key}=.*$`, "m");
  content = regex.test(content)
    ? content.replace(regex, `${key}=${value}`)
    : content.trimEnd() + `\n${key}=${value}\n`;
  writeFileSync(ENV_PATH, content, "utf8");
}

// 0G operator EVM address (derived from OG_OPERATOR_PRIVATE_KEY)
const OG_OPERATOR = "0x71197e7a1CA5A2cb2AD82432B924F69B1E3dB123";

const SERVICE_AGENTS = [
  {
    agentName: "vega",
    name: "Vega",
    category: "Analytics",
    description: "Audience intelligence agent. Analyzes target audiences — personas, communities, pain points, and the best channels to reach them.",
    persona: "Precise audience research analyst with deep knowledge of online communities and user behavior patterns.",
    targetAudience: "Founders, product managers, and growth teams building for specific niches",
    channels: ["X (Twitter)", "LinkedIn"],
    toneVoice: "Data-driven, clear, structured. Surfaces insights fast.",
    tokenSymbol: "VEGA",
    service: { serviceName: "audience_insight", description: "Analyze a target audience: personas, communities, pain points, and best channels to reach them.", price: 0.005 },
  },
  {
    agentName: "atlas",
    name: "Atlas",
    category: "Research",
    description: "Trend research agent. Tracks market trends, hot topics, and emerging opportunities across X, Reddit, and Hacker News in real-time.",
    persona: "Trend analyst tracking discussions across X, Reddit, Hacker News, and Product Hunt.",
    targetAudience: "Investors, founders, and product teams looking to ride emerging trends",
    channels: ["X (Twitter)", "Reddit"],
    toneVoice: "Concise signal delivery. Trends with momentum scores and context.",
    tokenSymbol: "ATLS",
    service: { serviceName: "trend_research", description: "Research latest trends for a given market. Includes trending discussions, momentum scores, and opportunities.", price: 0.005 },
  },
  {
    agentName: "nova",
    name: "Nova",
    category: "Research",
    description: "Competitive intelligence agent. Deep-dives on competitors — features, pricing, positioning, and market gaps.",
    persona: "Competitive intelligence analyst who dissects products and surfaces positioning opportunities.",
    targetAudience: "Startups and product teams needing a clear competitive landscape map",
    channels: ["X (Twitter)", "LinkedIn"],
    toneVoice: "Sharp analysis. No fluff. Strengths, weaknesses, opportunities clearly separated.",
    tokenSymbol: "NOVA",
    service: { serviceName: "competitor_analysis", description: "Analyze competitors: features, pricing, strengths/weaknesses, market gaps, and positioning recommendations.", price: 0.008 },
  },
  {
    agentName: "forge",
    name: "Forge",
    category: "Sales",
    description: "Lead generation agent. Finds potential customers on social platforms based on target profile and product-market fit signals.",
    persona: "Lead gen specialist who identifies high-intent prospects based on stated pain points and job signals.",
    targetAudience: "B2B SaaS companies and agencies looking for warm leads",
    channels: ["X (Twitter)", "LinkedIn"],
    toneVoice: "Action-oriented. Quality over quantity. Always includes relevance scores.",
    tokenSymbol: "FRGE",
    service: { serviceName: "lead_generation", description: "Find and qualify potential customers matching your ICP on X and LinkedIn based on buying signals.", price: 0.01 },
  },
  {
    agentName: "echo",
    name: "Echo",
    category: "Marketing",
    description: "Copywriting and content agent. Writes high-converting threads, landing page copy, ad copy, and product narratives.",
    persona: "Conversion copywriter who understands positioning, narrative arcs, and what makes people click.",
    targetAudience: "Startups, indie hackers, and marketing teams needing compelling copy fast",
    channels: ["X (Twitter)", "LinkedIn"],
    toneVoice: "Punchy. Clear value prop front-loaded. Hooks that convert.",
    tokenSymbol: "ECHO",
    service: { serviceName: "copywriting", description: "Write high-converting copy: landing pages, X threads, ad copy, email sequences, and product narratives.", price: 0.006 },
  },
  {
    agentName: "radar",
    name: "Radar",
    category: "Sales",
    description: "Intent signal agent. Detects buying intent across platforms — people actively seeking solutions related to your product.",
    persona: "Intent signal analyst detecting 'looking for', 'need help', 'switching from' patterns across platforms.",
    targetAudience: "Sales teams and founders who want to reach buyers at the moment of intent",
    channels: ["X (Twitter)", "Reddit"],
    toneVoice: "Real-time alerts. Context-rich. Prioritized by urgency and fit score.",
    tokenSymbol: "RDAR",
    service: { serviceName: "intent_signal", description: "Detect buying intent signals: people seeking solutions, switching tools, or frustrated with alternatives.", price: 0.01 },
  },
];

async function main() {
  console.log("▶  Seeding 6 TALOS agents to DB + 0G Galileo chain...\n");

  // Delete existing demo agents (clean re-seed)
  for (const agent of SERVICE_AGENTS) {
    const existing = await db
      .select({ id: schema.tlsTalos.id })
      .from(schema.tlsTalos)
      .where(eq(schema.tlsTalos.agentName, agent.agentName))
      .limit(1)
      .then((r) => r[0] ?? null);
    if (existing) {
      await db.delete(schema.tlsTalos).where(eq(schema.tlsTalos.id, existing.id));
      console.log(`  🗑  Deleted existing @${agent.agentName}`);
    }
  }
  console.log();

  const results: Array<{ agentName: string; name: string; id: string; apiKey: string; onChainId: number | null; walletAddress: string; ensName: string | null }> = [];

  for (const agent of SERVICE_AGENTS) {
    const apiKey = generateApiKey();

    // ── 1. Generate unique EVM keypair for this agent (0G Chain) ─────────────
    const keypair = createAgentKeypair();
    const agentWalletAddress = keypair.address; // 0x... format
    // Store private key in .env.local as TALOS_AGENT_SECRET_{shortKey}
    const keySlug = apiKey.slice(4, 12);
    appendEnv(`TALOS_AGENT_SECRET_${keySlug}`, keypair.privateKey);

    // ── 2. Insert into DB ─────────────────────────────────────────────────────
    const [talos] = await db
      .insert(schema.tlsTalos)
      .values({
        agentName: agent.agentName,
        name: agent.name,
        category: agent.category,
        description: agent.description,
        persona: agent.persona,
        targetAudience: agent.targetAudience,
        channels: agent.channels,
        toneVoice: agent.toneVoice,
        tokenSymbol: agent.tokenSymbol,
        tokenCode: agent.tokenSymbol,
        status: "Active",
        agentOnline: false,
        apiKey,
        // EVM addresses (0x... format — 0G Chain)
        walletPublicKey: OG_OPERATOR,
        creatorPublicKey: OG_OPERATOR,
        agentWalletId: agentWalletAddress,
        agentWalletAddress,
        pulsePrice: "0.01",
        totalSupply: 1_000_000,
        creatorShare: 60,
        investorShare: 25,
        treasuryShare: 15,
        approvalThreshold: "10",
        gtmBudget: "200",
        minPatronPulse: 100,
      })
      .returning();

    // ── 3. Commerce service (A0GI — 0G Chain) ────────────────────────────────
    await db.insert(schema.tlsCommerceServices).values({
      talosId: talos.id,
      serviceName: agent.service.serviceName,
      description: agent.service.description,
      price: String(agent.service.price),
      currency: "A0GI",
      walletAddress: agentWalletAddress,
      chains: ["0g"],
      fulfillmentMode: "async",
    });

    // ── 4. Register on 0G Galileo chain ──────────────────────────────────────
    let onChainId: number | null = null;
    try {
      console.log(`  ⛓  Registering @${agent.agentName} on 0G Galileo...`);
      const chainResult = await createTalosOnChain({
        name: agent.name,
        category: agent.category,
        description: agent.description,
        creatorAddr: OG_OPERATOR,
        approvalThreshold: 10,
        gtmBudget: 200,
        totalSupply: 1_000_000,
        tokenSymbol: agent.tokenSymbol,
      });

      if (chainResult) {
        onChainId = Number(chainResult.onChainId);
        await db
          .update(schema.tlsTalos)
          .set({ onChainId })
          .where(eq(schema.tlsTalos.id, talos.id));
        await registerNameOnChain(chainResult.onChainId, agent.agentName).catch(() => {});
        console.log(`     ✓ On-chain ID: ${onChainId}, tx: ${chainResult.txHash.slice(0, 16)}...`);
      } else {
        console.log(`     ⚠  Chain registration skipped (contract not configured)`);
      }
    } catch (err) {
      console.log(`     ⚠  Chain error: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }

    // ── 5. Register ENS subname {agentName}.talos.eth ─────────────────────────
    let ensName: string | null = null;
    if (process.env.ENS_REGISTRAR_PRIVATE_KEY) {
      try {
        console.log(`  🔤  Registering ${agent.agentName}.talos.eth on Sepolia...`);
        const { registerAgentEns } = await import("../src/lib/ens");
        const ensResult = await registerAgentEns({
          agentName: agent.agentName,
          ownerAddress: agentWalletAddress,
          talosId: talos.id,
          category: agent.category,
          persona: agent.persona,
        });
        if (ensResult) {
          ensName = ensResult.ensName;
          await db.update(schema.tlsTalos).set({ ensName }).where(eq(schema.tlsTalos.id, talos.id));
          console.log(`     ✓ ${ensName}`);
        }
      } catch (err) {
        console.log(`     ⚠  ENS error: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      }
    }

    // ── 6. Write API key to .env.local ────────────────────────────────────────
    appendEnv(`TALOS_AGENT_KEY_${agent.agentName.toUpperCase()}`, apiKey);
    console.log(`  ✅ ${agent.name} (@${agent.agentName}) → ${talos.id}`);
    console.log(`     Wallet: ${agentWalletAddress}`);

    results.push({ agentName: agent.agentName, name: agent.name, id: talos.id, apiKey, onChainId, walletAddress: agentWalletAddress, ensName });
    console.log();
  }

  // Combined key list for Railway multi-agent mode
  const allKeys = results.map((r) => r.apiKey).join(",");
  appendEnv("TALOS_API_KEYS", allKeys);

  console.log("═".repeat(70));
  console.log("  TALOS AGENTS SEEDED (0G Chain)");
  console.log("═".repeat(70));

  for (const r of results) {
    console.log(`\n  🤖 ${r.name} (@${r.agentName})`);
    console.log(`     DB ID:       ${r.id}`);
    console.log(`     On-chain ID: ${r.onChainId ?? "pending"}`);
    console.log(`     Wallet (0G): ${r.walletAddress}`);
    console.log(`     ENS:         ${r.ensName ?? "not registered"}`);
    console.log(`     API Key:     ${r.apiKey.slice(0, 20)}...`);
  }

  console.log("\n" + "═".repeat(70));
  console.log("\n  Railway env vars (packages/prime-agent):\n");
  console.log(`  TALOS_API_URL=https://talos-0g.vercel.app`);
  console.log(`  TALOS_API_KEYS=${allKeys}`);
  console.log(`  OG_OPERATOR_PRIVATE_KEY=${process.env.OG_OPERATOR_PRIVATE_KEY ?? "<key>"}`);
  console.log(`  GROQ_API_KEY=<groq-key>`);
  console.log(`  BROWSER_HEADLESS=true`);
  console.log("═".repeat(70) + "\n");

  await pool.end();
}

main().catch(async (err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  await pool.end();
  process.exit(1);
});
