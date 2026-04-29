/**
 * 0G Storage integration for Talos Protocol.
 *
 * SDK: @0glabs/0g-ts-sdk
 * Docs: https://docs.0g.ai/build-with-0g/storage-sdk
 *
 * Actual SDK API (verified from source):
 *   ZgFile.fromFilePath(path) → ZgFile
 *   ZgFile.merkleTree() → [tree | null, Error | null]
 *   indexer.upload(file, blockchain_rpc, signer) → [{ txHash, rootHash }, Error | null]
 *   indexer.download(rootHash, filePath, proof) → Error | null
 */

import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentState {
  talosId: string;
  agentName: string;
  status: "active" | "idle" | "offline";
  lastSeen: number;
  cycleCount: number;
  totalRevenue: number;
  activeJob: string | null;
  metadata: Record<string, unknown>;
}

export interface AgentMemoryEntry {
  timestamp: number;
  type: "activity" | "commerce" | "research" | "decision";
  content: string;
  talosId: string;
  metadata?: Record<string, unknown>;
}

// ── Config ────────────────────────────────────────────────────────────────────

const OG_STORAGE_RPC =
  process.env.OG_STORAGE_RPC ?? "https://indexer-storage-testnet-standard.0g.ai";

const EVM_RPC = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai/v1";

const OG_PRIVATE_KEY = process.env.OG_OPERATOR_PRIVATE_KEY ?? "";

// ── Upload helpers ────────────────────────────────────────────────────────────

async function uploadJSON(
  data: unknown,
  label: string,
): Promise<string | null> {
  if (!OG_PRIVATE_KEY) {
    console.warn("[og-storage] OG_OPERATOR_PRIVATE_KEY not set — skipping upload");
    return null;
  }

  const { ZgFile, Indexer } = await import("@0glabs/0g-ts-sdk");
  const { ethers } = await import("ethers");

  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const signer = new ethers.Wallet(OG_PRIVATE_KEY, provider);
  const indexer = new Indexer(OG_STORAGE_RPC);

  // SDK only accepts file paths — write to temp, upload, delete
  const tmpPath = join(tmpdir(), `talos-${label}-${Date.now()}.json`);
  try {
    writeFileSync(tmpPath, JSON.stringify(data), "utf-8");
    const file = await ZgFile.fromFilePath(tmpPath);

    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw treeErr;
    const rootHash = tree!.rootHash();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, uploadErr] = await indexer.upload(file, EVM_RPC, signer as any);
    if (uploadErr) throw uploadErr;

    await file.close();
    return rootHash;
  } finally {
    try { unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Store agent state in 0G Storage.
 * Returns the root hash on success, null on failure or if storage is unconfigured.
 */
export async function storeAgentState(state: AgentState): Promise<string | null> {
  try {
    const rootHash = await uploadJSON(state, `state-${state.talosId}`);
    if (rootHash) console.log(`[og-storage] Agent state stored for ${state.talosId}: ${rootHash}`);
    return rootHash;
  } catch (err) {
    console.error("[og-storage] storeAgentState failed:", err);
    return null;
  }
}

/**
 * Append an entry to agent memory log in 0G Storage.
 */
export async function appendAgentMemory(entry: AgentMemoryEntry): Promise<string | null> {
  try {
    const rootHash = await uploadJSON(entry, `memory-${entry.talosId}`);
    if (rootHash) console.log(`[og-storage] Memory entry stored for ${entry.talosId}`);
    return rootHash;
  } catch (err) {
    console.error("[og-storage] appendAgentMemory failed:", err);
    return null;
  }
}

/**
 * Store a playbook in 0G Storage. Returns root hash for retrieval.
 */
export async function storePlaybook(
  talosId: string,
  playbookId: string,
  content: Record<string, unknown>,
): Promise<string | null> {
  try {
    const rootHash = await uploadJSON(content, `playbook-${playbookId}`);
    if (rootHash) console.log(`[og-storage] Playbook ${playbookId} stored for ${talosId}: ${rootHash}`);
    return rootHash;
  } catch (err) {
    console.error("[og-storage] storePlaybook failed:", err);
    return null;
  }
}

/**
 * Download a file from 0G Storage by root hash. Returns parsed JSON string.
 */
export async function downloadFromStorage(rootHash: string): Promise<string | null> {
  try {
    const { Indexer } = await import("@0glabs/0g-ts-sdk");
    const indexer = new Indexer(OG_STORAGE_RPC);

    const outputPath = join(tmpdir(), `og-dl-${rootHash.slice(0, 16)}.json`);
    const err = await indexer.download(rootHash, outputPath, false);
    if (err) throw err;

    const content = readFileSync(outputPath, "utf-8");
    try { unlinkSync(outputPath); } catch { /* best-effort */ }
    return content;
  } catch (err) {
    console.error("[og-storage] downloadFromStorage failed:", err);
    return null;
  }
}

// ── In-memory fallback (dev / offline) ───────────────────────────────────────

const memStore = new Map<string, string>();

export function memSet(key: string, value: string): void {
  memStore.set(key, value);
}

export function memGet(key: string): string | null {
  return memStore.get(key) ?? null;
}
