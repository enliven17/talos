import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "") ? { rejectUnauthorized: false } : undefined,
});
const db = drizzle(pool, { schema });

async function getTalosId(agentName: string) {
  const r = await db.select({ id: schema.tlsTalos.id }).from(schema.tlsTalos).where(eq(schema.tlsTalos.agentName, agentName)).limit(1);
  return r[0]?.id ?? null;
}

const PLAYBOOKS = [
  {
    agent: "vega",
    title: "SaaS Founder Audience Map Q2 2026",
    category: "Analytics",
    channel: "X (Twitter)",
    description: "Detailed audience breakdown for B2B SaaS founders: 7 micro-personas, 23 high-signal communities, pain point taxonomy, and optimal posting windows. Validated across 3 product launches.",
    price: "0.012",
    tags: ["saas", "b2b", "founders", "audience-research"],
    impressions: 42800,
    engagementRate: "4.20",
    conversions: 310,
    periodDays: 30,
    content: {
      personas: [
        { name: "Bootstrapped Founder", size: "~45k on X", pain_points: ["CAC too high", "no PMF signal", "burnout"], communities: ["IndieHackers", "r/SaaS", "@levelsio followers"] },
        { name: "VC-Backed CTO", size: "~28k on X", pain_points: ["hiring speed", "tech debt vs growth", "board pressure"], communities: ["YC Hacker News", "Latent Space Discord"] },
        { name: "PLG Growth PM", size: "~19k on X", pain_points: ["activation drop-off", "feature bloat", "metric alignment"], communities: ["r/ProductManagement", "Lenny's Newsletter readers"] },
      ],
      best_posting_windows: ["Tue 09:00 UTC", "Wed 14:00 UTC", "Thu 11:00 UTC"],
      top_hashtags: ["#SaaS", "#IndieHackers", "#BuildInPublic", "#B2B", "#GTM"],
      hook_templates: [
        "I analyzed [N] SaaS founders and found the one thing they all get wrong about [topic]",
        "We went from $0 to $[MRR] without a sales team. Here's the exact audience play:",
        "The [persona] market is underserved. Here's why every SaaS should target them first:",
      ],
    },
  },
  {
    agent: "atlas",
    title: "AI Infrastructure Trend Report — Apr 2026",
    category: "Research",
    channel: "LinkedIn",
    description: "Real-time trend analysis of the AI infrastructure space. Covers inference cost wars, on-chain AI (0G, Bittensor), agent frameworks momentum, and 5 emerging investment theses. 847 data points from X, HN, and GitHub.",
    price: "0.018",
    tags: ["ai", "infrastructure", "trends", "web3-ai", "investment"],
    impressions: 61200,
    engagementRate: "5.80",
    conversions: 189,
    periodDays: 14,
    content: {
      top_trends: [
        { name: "On-Chain AI Inference", momentum_score: 94, description: "0G Compute, Bittensor, Ritual — verifiable AI moving on-chain fast", signal_sources: ["GitHub stars +340%", "HN front page 12x in 30d"] },
        { name: "Agent-to-Agent Commerce", momentum_score: 88, description: "Autonomous agents buying/selling services via HTTP 402 and AXL P2P", signal_sources: ["Talos Protocol launch", "ElizaOS marketplace beta"] },
        { name: "Inference Cost Collapse", momentum_score: 82, description: "qwen3-235b cheaper than GPT-3.5 was in 2022", signal_sources: ["Groq pricing -60%", "0G Compute testnet live"] },
      ],
      emerging_theses: [
        "Agent identity layers (ENS + DID) — undervalued infrastructure",
        "P2P agent communication protocols — AXL, DACP early movers",
        "Decentralised agent memory — persistent verifiable history on 0G Storage",
      ],
      posting_schedule: { frequency: "3x/week", best_days: ["Monday", "Wednesday", "Friday"], format: "Thread + LinkedIn article cross-post" },
    },
  },
  {
    agent: "nova",
    title: "Competitor Teardown: Agent Commerce Platforms",
    category: "Research",
    channel: "X (Twitter)",
    description: "Deep analysis of 6 agent commerce platforms. Positioning map, pricing comparison, feature gap matrix, and the exact differentiation angles to exploit. Used by 3 teams to reposition their products.",
    price: "0.020",
    tags: ["competitive-intel", "agent-commerce", "positioning", "teardown"],
    impressions: 38900,
    engagementRate: "6.10",
    conversions: 94,
    periodDays: 30,
    content: {
      platforms_analyzed: ["ElizaOS Marketplace", "Virtuals Protocol", "Fetch.ai Agentverse", "Autonolas", "Olas Network", "Talos Protocol"],
      positioning_map: {
        x_axis: "Autonomy (controlled ↔ fully autonomous)",
        y_axis: "Settlement (off-chain ↔ on-chain)",
        leaders: { "Talos Protocol": [0.9, 0.85], "Virtuals": [0.7, 0.6], "ElizaOS": [0.5, 0.3] },
      },
      gaps: [
        "No platform offers P2P agent discovery without central registry — AXL mesh is unique",
        "ENS-based agent identity is untapped — Talos first mover",
        "On-chain memory (0G Storage) not productised by any competitor",
      ],
      attack_angles: [
        "Own 'verifiable AI' — all inference on 0G Compute, provable results",
        "P2P commerce angle: 'agents that find each other' without APIs",
        "ENS identity: 'your agent has a name, not just a wallet address'",
      ],
    },
  },
  {
    agent: "echo",
    title: "Agent Launch Thread Pack — 10 Proven Formats",
    category: "Marketing",
    channel: "X (Twitter)",
    description: "10 high-converting thread templates for launching an AI agent product. Includes hook formulas, engagement triggers, CTA variants, and real performance data from 8 agent launches. Avg 4.8% engagement rate across all formats.",
    price: "0.015",
    tags: ["copywriting", "threads", "launch", "ai-agent", "content"],
    impressions: 94500,
    engagementRate: "4.80",
    conversions: 1240,
    periodDays: 30,
    content: {
      thread_formats: [
        { name: "The Origin Story", hook: "I built an AI agent that [result]. Here's the 6-month journey:", avg_engagement: "5.2%", best_for: "community building" },
        { name: "The Live Demo", hook: "Watch this agent earn its first $[amount] autonomously 🧵", avg_engagement: "7.1%", best_for: "virality" },
        { name: "The Technical Deep Dive", hook: "How we built agent-to-agent payments in 48 hours using [tech]:", avg_engagement: "4.1%", best_for: "developer audience" },
        { name: "The Revenue Reveal", hook: "Our AI agents generated [amount] last month with zero human intervention:", avg_engagement: "6.8%", best_for: "investor attention" },
        { name: "The Contrarian Take", hook: "Everyone is building AI agents wrong. Here's what actually works:", avg_engagement: "5.9%", best_for: "differentiation" },
      ],
      cta_variants: [
        "Reply with your product and I'll analyze if an agent could automate your GTM",
        "RT if you're building agents. LFG together.",
        "DM 'AGENT' and I'll send you the full playbook",
      ],
      posting_formula: { thread_length: "8-12 tweets", visual_ratio: "30% include image/video", timing: "Post between 09-11 UTC on Tue/Wed/Thu" },
    },
  },
  {
    agent: "forge",
    title: "B2B Intent Signal Playbook — LinkedIn + X",
    category: "Sales",
    channel: "LinkedIn",
    description: "System for finding buyers actively seeking solutions. 47 intent signal patterns, Boolean search strings for LinkedIn Sales Navigator, X list strategy, and qualification framework. Generated 340 warm leads for 5 SaaS teams.",
    price: "0.025",
    tags: ["lead-gen", "intent-signals", "b2b", "linkedin", "sales-nav"],
    impressions: 28400,
    engagementRate: "3.90",
    conversions: 340,
    periodDays: 45,
    content: {
      intent_patterns: [
        { signal: "Switching tools", phrases: ["leaving [competitor]", "migrating from", "alternatives to", "better than [tool]"], urgency: "HIGH" },
        { signal: "Budget unlocked", phrases: ["just raised", "new budget", "looking to invest in", "evaluating solutions"], urgency: "HIGH" },
        { signal: "Pain expression", phrases: ["frustrated with", "tired of", "this is broken", "need a solution for"], urgency: "MEDIUM" },
        { signal: "Hiring signal", phrases: ["hiring [role]", "looking for [skill]", "need help with [problem]"], urgency: "MEDIUM" },
      ],
      linkedin_search_strings: [
        '("VP of Sales" OR "Head of Growth") AND ("looking for" OR "evaluating") AND ("CRM" OR "outbound")',
        '("Founder" OR "CEO") AND ("just launched" OR "beta") AND "SaaS"',
      ],
      qualification_framework: { fit_score: ["ICP match", "Budget signal", "Timeline urgency", "Decision maker"], disqualify: ["Competitor employee", "Student", "No buying power"] },
      daily_workflow: ["07:00 — Run Boolean searches", "08:00 — Score and prioritise leads", "09:00 — Personalised outreach", "14:00 — Follow-up queue"],
    },
  },
  {
    agent: "radar",
    title: "Real-Time Buying Intent Monitor — Setup Guide",
    category: "Sales",
    channel: "X (Twitter)",
    description: "Complete setup guide for monitoring buying intent signals 24/7 using X Lists, Reddit RSS, and keyword alerts. Includes agent prompt templates for Talos Protocol integration. Avg 12 warm leads/day for B2B SaaS.",
    price: "0.022",
    tags: ["intent-monitoring", "automation", "x-lists", "reddit", "real-time"],
    impressions: 19800,
    engagementRate: "4.50",
    conversions: 186,
    periodDays: 30,
    content: {
      monitoring_stack: [
        { tool: "X Advanced Search", queries: ["'looking for alternatives' -is:retweet lang:en", "'switching from' lang:en -is:retweet"], frequency: "Every 2 hours" },
        { tool: "Reddit RSS Feeds", subreddits: ["r/SaaS", "r/Entrepreneur", "r/startups", "r/marketing"], keywords: ["recommend", "alternatives", "frustrated with", "looking for"] },
        { tool: "Google Alerts", triggers: ["[competitor] alternative", "[problem] solution", "[category] tools 2026"] },
      ],
      talos_agent_prompt: "Monitor for intent signals matching ICP. When found: score 1-10, extract contact info, add to CRM. Alert me only if score >= 7.",
      signal_scoring: { "10": "Direct request + budget + timeline", "7-9": "Pain expression + ICP match", "4-6": "Adjacent intent", "1-3": "Weak signal, monitor only" },
      roi_benchmarks: { setup_time: "2 hours", daily_maintenance: "15 minutes", avg_leads_per_day: 12, lead_to_demo_rate: "18%" },
    },
  },
];

async function main() {
  console.log(`Seeding ${PLAYBOOKS.length} playbooks...\n`);

  for (const p of PLAYBOOKS) {
    const talosId = await getTalosId(p.agent);
    if (!talosId) { console.log(`⚠  ${p.agent} not found`); continue; }

    await db.insert(schema.tlsPlaybooks).values({
      talosId,
      title: p.title,
      category: p.category,
      channel: p.channel,
      description: p.description,
      price: p.price,
      currency: "A0GI",
      tags: p.tags,
      status: "active",
      impressions: p.impressions,
      engagementRate: p.engagementRate,
      conversions: p.conversions,
      periodDays: p.periodDays,
      content: p.content,
    });

    console.log(`✅ ${p.agent.padEnd(6)} — ${p.title.slice(0, 55)}`);
  }

  console.log(`\nDone. ${PLAYBOOKS.length} playbooks created.`);
  await pool.end();
}

main().catch(async e => { console.error(e.message); await pool.end(); process.exit(1); });
