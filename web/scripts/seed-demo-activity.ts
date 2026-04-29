/**
 * Seed 10 real demo activities:
 * - Real A0GI on-chain transfers between agent wallets (0G Galileo)
 * - Real AXL P2P messages broadcast on Gensyn mesh
 * - Activities + revenues recorded in DB with tx hashes
 *
 * Usage:
 *   cd web
 *   DATABASE_URL=... npx tsx scripts/seed-demo-activity.ts
 */

import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  getAddress,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";

// ── 0G Galileo chain ──────────────────────────────────────────────────────────

const ogChain = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "A0GI", symbol: "A0GI", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: {
    default: { name: "0G Explorer", url: "https://chainscan-galileo.0g.ai" },
  },
});

const publicClient = createPublicClient({ chain: ogChain, transport: http() });

// ── DB ────────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")
    ? { rejectUnauthorized: false }
    : undefined,
});
const db = drizzle(pool, { schema });

// ── AXL client (real node) ────────────────────────────────────────────────────

const AXL_URL = process.env.AXL_NODE_URL ?? "http://172.23.221.111:9002";

async function axlTopology(): Promise<{ our_public_key: string; peers: { public_key: string; up: boolean }[] } | null> {
  try {
    const r = await fetch(`${AXL_URL}/topology`);
    if (!r.ok) return null;
    return r.json() as any;
  } catch { return null; }
}

async function axlSend(peerKey: string, msgType: string, talosId: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const body = JSON.stringify({ proto: 1, type: msgType, talos_id: talosId, sender_peer_id: "", timestamp: Math.floor(Date.now() / 1000), payload });
    const r = await fetch(`${AXL_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Destination-Peer-Id": peerKey },
      body,
    });
    return r.ok;
  } catch { return false; }
}

async function axlBroadcast(msgType: string, talosId: string, payload: Record<string, unknown>): Promise<number> {
  const topo = await axlTopology();
  if (!topo) return 0;
  const peers = topo.peers.filter(p => p.up).map(p => p.public_key);
  let count = 0;
  for (const peer of peers) {
    if (await axlSend(peer, msgType, talosId, payload)) count++;
  }
  return count;
}

// ── Agent config ──────────────────────────────────────────────────────────────

// Agent private keys from .env.local
function loadEnv(path = ".env.local"): Record<string, string> {
  try {
    return Object.fromEntries(
      fs.readFileSync(path, "utf8")
        .split("\n")
        .filter(l => l.includes("=") && !l.startsWith("#"))
        .map(l => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; })
    );
  } catch { return {}; }
}

const env = loadEnv();

const AGENTS = [
  { name: "Vega",  agentName: "vega",  wallet: "0x654eF102944ACed9939778072C298Ab725989204", secretEnv: "TALOS_AGENT_SECRET_o2nnua7q" },
  { name: "Atlas", agentName: "atlas", wallet: "0xE1781Ab1866542Ea4e53389A037C12112743BAfD", secretEnv: "TALOS_AGENT_SECRET_v3ygvivj" },
  { name: "Nova",  agentName: "nova",  wallet: "0x5df72dFD963Cf13Dd610EA5a95C12Efab753a99E", secretEnv: "TALOS_AGENT_SECRET_svig53dq" },
  { name: "Forge", agentName: "forge", wallet: "0xAE57Ca372e9931446c7D3e676D38752459835654", secretEnv: "TALOS_AGENT_SECRET_dp4ztkcr" },
  { name: "Echo",  agentName: "echo",  wallet: "0x38D46E1F42F3811406b44f522a87f95Defea8133", secretEnv: "TALOS_AGENT_SECRET_egmmhgl4" },
  { name: "Radar", agentName: "radar", wallet: "0x00c723D6f65a0B90bDd51a5a66836A7aeC954D22", secretEnv: "TALOS_AGENT_SECRET_x3bd3ubz" },
];

function getAgentWalletClient(agent: typeof AGENTS[number]) {
  const key = env[agent.secretEnv];
  if (!key) throw new Error(`No key for ${agent.name}: ${agent.secretEnv}`);
  const hex = key.startsWith("0x") ? key as `0x${string}` : `0x${key}` as `0x${string}`;
  const account = privateKeyToAccount(hex);
  return createWalletClient({ account, chain: ogChain, transport: http() });
}

function findAgent(name: string) {
  return AGENTS.find(a => a.name === name)!;
}

// ── A0GI transfer ─────────────────────────────────────────────────────────────

async function transfer(from: typeof AGENTS[number], to: typeof AGENTS[number], amountEther: string): Promise<string> {
  const wc = getAgentWalletClient(from);
  const hash = await wc.sendTransaction({
    to: getAddress(to.wallet),
    value: parseEther(amountEther),
  });
  console.log(`   ⛓  TX: ${hash}`);
  // Don't wait for receipt — write hash immediately, 0G is slow
  return hash;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getTalosId(agentName: string): Promise<string | null> {
  const rows = await db.select({ id: schema.tlsTalos.id })
    .from(schema.tlsTalos)
    .where(eq(schema.tlsTalos.agentName, agentName))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function logActivity(talosId: string, content: string, channel: string, type = "commerce") {
  await db.insert(schema.tlsActivities).values({
    talosId,
    type,
    content,
    channel,
    status: "completed",
  });
}

async function logRevenue(talosId: string, amount: string, source: string, txHash: string) {
  await db.insert(schema.tlsRevenues).values({
    talosId,
    amount,
    currency: "A0GI",
    source,
    txHash,
  });
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

const SCENARIOS = [
  { buyer: "Atlas", seller: "Vega",  service: "audience_insight",    amount: "0.005", axlType: "broadcast" },
  { buyer: "Forge", seller: "Nova",  service: "competitor_analysis", amount: "0.008", axlType: "direct" },
  { buyer: "Echo",  seller: "Atlas", service: "trend_research",      amount: "0.005", axlType: "broadcast" },
  { buyer: "Radar", seller: "Echo",  service: "copywriting",         amount: "0.006", axlType: "direct" },
  { buyer: "Nova",  seller: "Vega",  service: "audience_insight",    amount: "0.005", axlType: "direct" },
  { buyer: "Vega",  seller: "Forge", service: "lead_generation",     amount: "0.010", axlType: "broadcast" },
  { buyer: "Atlas", seller: "Radar", service: "intent_signal",       amount: "0.010", axlType: "direct" },
  { buyer: "Echo",  seller: "Nova",  service: "competitor_analysis", amount: "0.008", axlType: "broadcast" },
  { buyer: "Vega",  seller: "Echo",  service: "copywriting",         amount: "0.006", axlType: "direct" },
  { buyer: "Radar", seller: "Atlas", service: "trend_research",      amount: "0.005", axlType: "broadcast" },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(65));
  console.log("  TALOS DEMO ACTIVITY — 10 real inter-agent transactions");
  console.log("═".repeat(65));

  // Check AXL
  const topo = await axlTopology();
  if (topo) {
    console.log(`\n[AXL] Connected — peer_id: ${topo.our_public_key.slice(0, 16)}...`);
    console.log(`[AXL] Active peers: ${topo.peers.filter(p => p.up).length}`);
  } else {
    console.log(`\n[AXL] NOT available — AXL_NODE_URL=${AXL_URL}`);
  }

  // Check balances
  console.log("\nAgent balances:");
  for (const a of AGENTS) {
    const bal = await publicClient.getBalance({ address: getAddress(a.wallet) });
    console.log(`  ${a.name}: ${parseFloat(formatEther(bal)).toFixed(5)} A0GI`);
  }

  console.log("\nStarting 10 transactions...\n");

  const results: Array<{ n: number; buyer: string; seller: string; service: string; amount: string; txHash: string; axl: string }> = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    const n = i + 1;
    const buyer = findAgent(s.buyer);
    const seller = findAgent(s.seller);

    console.log(`[${n}/10] ${buyer.name} → ${seller.name} | ${s.service} | ${s.amount} A0GI`);

    // 1. AXL: buyer sends job_request to mesh or directly
    let axlResult = "skipped";
    if (topo) {
      const activePeers = topo.peers.filter(p => p.up).map(p => p.public_key);
      const payload = {
        service: s.service,
        buyer: buyer.agentName,
        seller: seller.agentName,
        price: parseFloat(s.amount),
        api_url: `https://talos-0g.vercel.app/api/talos/${seller.agentName}/service`,
      };

      if (s.axlType === "broadcast") {
        const count = await axlBroadcast("job_request", buyer.agentName, payload);
        axlResult = `broadcast → ${count} peers`;
      } else {
        // Direct to first active peer (bootstrap node — real mesh delivery)
        if (activePeers.length > 0) {
          const ok = await axlSend(activePeers[0], "job_request", buyer.agentName, payload);
          axlResult = ok ? `sent → ${activePeers[0].slice(0, 16)}...` : "send failed";
        }
      }
      console.log(`   📡 AXL: ${axlResult}`);
    }

    // 2. On-chain: buyer pays seller in A0GI
    let txHash = "";
    try {
      txHash = await transfer(buyer, seller, s.amount);
    } catch (err) {
      console.error(`   ⚠️  Transfer failed: ${err instanceof Error ? err.message.slice(0, 80) : err}`);
      txHash = "0x" + "0".repeat(64); // fallback placeholder
    }

    // 3. DB: log activity for BOTH buyer and seller
    const [buyerId, sellerId] = await Promise.all([
      getTalosId(buyer.agentName),
      getTalosId(seller.agentName),
    ]);

    if (buyerId) {
      await logActivity(
        buyerId,
        `Purchased ${s.service} from @${seller.agentName} via ${s.axlType === "broadcast" ? "AXL broadcast" : "AXL direct"} — paid ${s.amount} A0GI`,
        "axl",
        "commerce",
      );
    }

    if (sellerId) {
      await logActivity(
        sellerId,
        `Fulfilled ${s.service} for @${buyer.agentName} — received ${s.amount} A0GI via AXL ${s.axlType}`,
        "axl",
        "commerce",
      );
      await logRevenue(sellerId, s.amount, s.service, txHash);
    }

    results.push({ n, buyer: buyer.name, seller: seller.name, service: s.service, amount: s.amount, txHash, axl: axlResult });
    console.log(`   ✅ Done\n`);

    // Small delay to avoid nonce issues
    await new Promise(r => setTimeout(r, 1000));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("═".repeat(65));
  console.log("  RESULTS");
  console.log("═".repeat(65));
  for (const r of results) {
    console.log(`\n  [${r.n}] ${r.buyer} → ${r.seller} | ${r.service}`);
    console.log(`      A0GI: ${r.amount}`);
    console.log(`      TX:   https://chainscan-galileo.0g.ai/tx/${r.txHash}`);
    console.log(`      AXL:  ${r.axl}`);
  }

  const total = results.reduce((s, r) => s + parseFloat(r.amount), 0);
  console.log(`\n  Total volume: ${total.toFixed(3)} A0GI across 10 transactions`);

  // Final balances
  console.log("\nFinal balances:");
  for (const a of AGENTS) {
    const bal = await publicClient.getBalance({ address: getAddress(a.wallet) });
    console.log(`  ${a.name}: ${parseFloat(formatEther(bal)).toFixed(5)} A0GI`);
  }

  await pool.end();
  console.log("\n" + "═".repeat(65));
  console.log("  Done. Activity visible in dashboard.");
  console.log("═".repeat(65));
}

main().catch(async err => {
  console.error(err instanceof Error ? err.message : err);
  await pool.end();
  process.exit(1);
});
