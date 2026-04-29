/**
 * 0G Chain EVM client-side helpers — re-exports from og-chain.ts.
 * Used by frontend wagmi config, launch page, and network guard.
 *
 * Previously: 0G Chain cosmwasm.ts (replaced)
 */

import { createPublicClient, http, decodeEventLog } from "viem";
import { ogChain, REGISTRY_ABI, NAME_SERVICE_ABI } from "./og-chain";

export { ogChain as initiaEvmChain } from "./og-chain"; // backwards-compat alias
export { REGISTRY_ABI as TALOS_REGISTRY_ABI, NAME_SERVICE_ABI as TALOS_NAME_SERVICE_ABI } from "./og-chain";

// Re-export chain config as INITIA_EVM_CHAIN_ID for any remaining references
export const INITIA_EVM_CHAIN_ID = ogChain.id;

export const TALOS_REGISTRY_CONTRACT =
  process.env.NEXT_PUBLIC_TALOS_REGISTRY_CONTRACT ?? "";

export const TALOS_NAME_SERVICE_CONTRACT =
  process.env.NEXT_PUBLIC_TALOS_NAME_SERVICE_CONTRACT ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEvmPublicClient() {
  return createPublicClient({
    chain: ogChain,
    transport: http(ogChain.rpcUrls.default.http[0]),
  });
}

/**
 * Parse the talosId from a createTalos transaction receipt.
 */
export function parseTalosIdFromLogs(
  logs: Array<{ data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] }>,
): number | null {
  for (const log of logs) {
    try {
      const event = decodeEventLog({
        abi: REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (event.eventName === "TalosCreated") {
        return Number((event.args as { talosId: bigint }).talosId);
      }
    } catch {
      // not our event
    }
  }
  return null;
}

/**
 * Check if a name is available on-chain.
 */
export async function isNameAvailableOnChain(name: string): Promise<boolean> {
  if (!TALOS_NAME_SERVICE_CONTRACT || TALOS_NAME_SERVICE_CONTRACT === "0x0000000000000000000000000000000000000000") {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && !/--/.test(name);
  }
  try {
    const client = getEvmPublicClient();
    const available = await client.readContract({
      address: TALOS_NAME_SERVICE_CONTRACT as `0x${string}`,
      abi: NAME_SERVICE_ABI,
      functionName: "isNameAvailable",
      args: [name],
    });
    return available as boolean;
  } catch {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && !/--/.test(name);
  }
}

/**
 * Resolve a .talos name to its on-chain TALOS ID.
 */
export async function resolveNameOnChain(name: string): Promise<number | null> {
  if (!TALOS_NAME_SERVICE_CONTRACT || TALOS_NAME_SERVICE_CONTRACT === "0x0000000000000000000000000000000000000000") return null;
  try {
    const client = getEvmPublicClient();
    const talosId = await client.readContract({
      address: TALOS_NAME_SERVICE_CONTRACT as `0x${string}`,
      abi: NAME_SERVICE_ABI,
      functionName: "resolveName",
      args: [name],
    });
    const id = Number(talosId as bigint);
    return id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Validate that an address is a valid EVM address (0x...).
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

// Keep old name for backwards compat with any remaining code
export const isValidInitiaAddress = isValidEvmAddress;

export async function ensureOgNetwork(address: string): Promise<void> {
  if (!isValidEvmAddress(address)) {
    throw new Error(
      "Invalid EVM address. Please connect a MetaMask or compatible EVM wallet.",
    );
  }
}

// Backwards compat alias
export const ensureInitiaNetwork = ensureOgNetwork;
