/**
 * Seed 6 example TALOS agents.
 * Usage: node scripts/seed-agents.mjs
 *
 * Requires web/.env.local to be set up (DATABASE_URL, INITIA_OPERATOR_SECRET, contracts).
 * Creates agents in DB + registers on Initia EVM chain.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// Load env from web/.env.local
const envPath = join(__dir, "../web/.env.local");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

// ── 6 Example Agents ─────────────────────────────────────────────────────────

const AGENTS = [
  {
    agentName: "marketbot",
    name: "MarketBot",
    category: "Marketing",
    description: "AI marketing agent that creates campaigns, manages social media presence, and grows brand awareness for Web3 projects.",
    persona: "You are MarketBot, an expert Web3 marketing strategist. You craft viral campaigns, write compelling copy, and analyze market trends to maximize growth.",
    targetAudience: "Web3 founders, DeFi protocols, NFT projects",
    channels: ["twitter", "telegram", "discord"],
    toneVoice: "Bold, data-driven, and energetic. Uses emojis strategically.",
    approvalThreshold: 50,
    gtmBudget: 500,
    totalSupply: 1000000,
    initialPrice: 0.01,
    tokenCode: "MBOT",
    tokenSymbol: "MBOT",
    serviceName: "Marketing Campaign",
    serviceDescription: "Full-stack marketing campaign for your Web3 project",
    servicePrice: 25,
    minPatronPulse: 100,
  },
  {
    agentName: "devassist",
    name: "DevAssist",
    category: "Development",
    description: "Senior AI software engineer specializing in smart contracts, DeFi protocols, and full-stack Web3 development.",
    persona: "You are DevAssist, a senior blockchain developer with expertise in Solidity, Rust, and TypeScript. You write clean, audited code and explain complex concepts simply.",
    targetAudience: "Developers, CTOs, technical founders",
    channels: ["github", "discord", "telegram"],
    toneVoice: "Technical but approachable. Precise, no fluff.",
    approvalThreshold: 100,
    gtmBudget: 300,
    totalSupply: 500000,
    initialPrice: 0.05,
    tokenCode: "DEVA",
    tokenSymbol: "DEVA",
    serviceName: "Smart Contract Development",
    serviceDescription: "Custom smart contract development and audit",
    servicePrice: 100,
    minPatronPulse: 50,
  },
  {
    agentName: "tradescout",
    name: "TradeScout",
    category: "Trading",
    description: "AI trading analyst that monitors markets, identifies opportunities, and provides real-time alerts for DeFi and crypto trading.",
    persona: "You are TradeScout, a quantitative trader and on-chain analyst. You analyze liquidity, whale movements, and technical patterns to surface alpha.",
    targetAudience: "Traders, investors, DeFi users",
    channels: ["telegram", "twitter"],
    toneVoice: "Sharp, concise, signal-heavy. No noise.",
    approvalThreshold: 200,
    gtmBudget: 1000,
    totalSupply: 2000000,
    initialPrice: 0.02,
    tokenCode: "TSCT",
    tokenSymbol: "TSCT",
    serviceName: "Trading Signals",
    serviceDescription: "Daily trading signals and market analysis",
    servicePrice: 10,
    minPatronPulse: 200,
  },
  {
    agentName: "contentai",
    name: "ContentAI",
    category: "Content",
    description: "AI content creator that produces blog posts, threads, newsletters, and educational content for crypto and Web3 audiences.",
    persona: "You are ContentAI, a prolific Web3 content creator. You transform complex DeFi concepts into engaging stories, threads, and educational content.",
    targetAudience: "Web3 projects, DAOs, crypto communities",
    channels: ["twitter", "substack", "mirror"],
    toneVoice: "Educational, engaging, story-driven. Makes complex simple.",
    approvalThreshold: 30,
    gtmBudget: 200,
    totalSupply: 750000,
    initialPrice: 0.008,
    tokenCode: "CTAI",
    tokenSymbol: "CTAI",
    serviceName: "Content Creation",
    serviceDescription: "Weekly content pack: 3 threads + 1 long-form article",
    servicePrice: 15,
    minPatronPulse: 75,
  },
  {
    agentName: "daoops",
    name: "DAOops",
    category: "Operations",
    description: "AI operations manager for DAOs — handles governance coordination, proposal drafting, treasury tracking, and community management.",
    persona: "You are DAOops, a seasoned DAO operator. You coordinate governance, draft proposals, manage contributors, and ensure smooth DAO operations.",
    targetAudience: "DAOs, protocol teams, decentralized communities",
    channels: ["discord", "snapshot", "telegram"],
    toneVoice: "Structured, diplomatic, and thorough. Community-first.",
    approvalThreshold: 75,
    gtmBudget: 400,
    totalSupply: 1500000,
    initialPrice: 0.015,
    tokenCode: "DAOO",
    tokenSymbol: "DAOO",
    serviceName: "DAO Operations",
    serviceDescription: "Monthly DAO operations package: governance + treasury",
    servicePrice: 50,
    minPatronPulse: 150,
  },
  {
    agentName: "secaudit",
    name: "SecAudit",
    category: "Security",
    description: "AI security analyst specializing in smart contract audits, vulnerability detection, and security best practices for DeFi protocols.",
    persona: "You are SecAudit, a blockchain security expert. You identify vulnerabilities, audit smart contracts, and provide actionable security recommendations.",
    targetAudience: "DeFi protocols, smart contract developers, VCs",
    channels: ["github", "discord", "telegram"],
    toneVoice: "Methodical, authoritative, risk-aware. Zero tolerance for vulnerabilities.",
    approvalThreshold: 500,
    gtmBudget: 200,
    totalSupply: 250000,
    initialPrice: 0.1,
    tokenCode: "SECA",
    tokenSymbol: "SECA",
    serviceName: "Security Audit",
    serviceDescription: "Smart contract security audit report",
    servicePrice: 200,
    minPatronPulse: 25,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("▶  Seeding 6 example TALOS agents...\n");
  console.log("   API:", API_BASE);

  const results = [];

  for (const agent of AGENTS) {
    console.log(`\n▶  Creating ${agent.name} (@${agent.agentName})...`);

    const body = {
      name: agent.name,
      agentName: agent.agentName,
      category: agent.category,
      description: agent.description,
      persona: agent.persona,
      targetAudience: agent.targetAudience,
      channels: agent.channels,
      toneVoice: agent.toneVoice,
      approvalThreshold: agent.approvalThreshold,
      gtmBudget: agent.gtmBudget,
      totalSupply: agent.totalSupply,
      initialPrice: agent.initialPrice,
      tokenCode: agent.tokenCode,
      tokenSymbol: agent.tokenSymbol,
      serviceName: agent.serviceName,
      serviceDescription: agent.serviceDescription,
      servicePrice: agent.servicePrice,
      minPatronPulse: agent.minPatronPulse,
      creatorPublicKey: process.env.INITIA_OPERATOR_ADDRESS ?? "",
      walletPublicKey: process.env.INITIA_OPERATOR_ADDRESS ?? "",
    };

    try {
      const res = await fetch(`${API_BASE}/api/talos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`   FAILED ${res.status}: ${err}`);
        continue;
      }

      const data = await res.json();
      console.log(`   ✓ Created: ${data.id}`);
      console.log(`   API Key: ${data.apiKeyOnce}`);
      if (data.agentWalletAddress) {
        console.log(`   Wallet:  ${data.agentWalletAddress}`);
      }

      results.push({
        agentName: agent.agentName,
        name: agent.name,
        id: data.id,
        apiKey: data.apiKeyOnce,
        wallet: data.agentWalletAddress,
      });
    } catch (err) {
      console.error(`   ERROR: ${err.message}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Railway env vars ekle:\n");
  for (const r of results) {
    console.log(`  TALOS_AGENT_SECRET_${r.id}=<agent_wallet_mnemonic>`);
  }
  console.log("\n  Oluşturulan ajanlar:");
  for (const r of results) {
    console.log(`  @${r.agentName} → ID: ${r.id} | Key: ${r.apiKey}`);
  }
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
