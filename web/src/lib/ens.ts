/**
 * ENS (Ethereum Name Service) integration for Talos agent identities.
 *
 * Each Talos agent gets an ENS subname: {agentName}.talos.eth
 * Agent metadata (wallet, service endpoint, category) stored in ENS text records.
 *
 * Network: Ethereum Sepolia testnet (for hackathon) / Mainnet for production
 * ENS docs: https://docs.ens.domains/
 *
 * Track: "Best ENS Integration for AI Agents" — $2,500
 */

import { createPublicClient, http, defineChain } from "viem";
import { sepolia, mainnet } from "viem/chains";

// ── Config ────────────────────────────────────────────────────────────────────

const ENS_NETWORK = (process.env.ENS_NETWORK as "sepolia" | "mainnet") ?? "sepolia";
const ENS_PARENT_DOMAIN = process.env.ENS_PARENT_DOMAIN ?? "talos.eth";
const ENS_REGISTRAR_KEY = process.env.ENS_REGISTRAR_PRIVATE_KEY;

// Use Sepolia for testnet, mainnet for production
const ensChain = ENS_NETWORK === "mainnet" ? mainnet : sepolia;

const ensPublicClient = createPublicClient({
  chain: ensChain,
  transport: http(
    ENS_NETWORK === "mainnet"
      ? (process.env.ETH_MAINNET_RPC ?? "https://eth.llamarpc.com")
      : (process.env.ETH_SEPOLIA_RPC ?? "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"),
  ),
});

// ── ENS text record keys for agent metadata ───────────────────────────────────

export const ENS_KEYS = {
  /** 0G Chain wallet address */
  WALLET: "og.wallet",
  /** Agent category (marketing, analytics, etc.) */
  CATEGORY: "ag.category",
  /** Service endpoint URL */
  SERVICE_URL: "ag.service.url",
  /** Service price in A0GI */
  SERVICE_PRICE: "ag.service.price",
  /** Talos DB id */
  TALOS_ID: "ag.talos.id",
  /** Agent persona description */
  PERSONA: "ag.persona",
  /** Protocol version */
  PROTOCOL: "ag.protocol",
  /** Avatar / profile image */
  AVATAR: "avatar",
  /** Website / dashboard URL */
  URL: "url",
  /** Twitter/X handle */
  TWITTER: "com.twitter",
} as const;

// ── ENS resolution ────────────────────────────────────────────────────────────

/**
 * Resolve an agent ENS name to their 0G wallet address.
 * e.g. "vega.talos.eth" → "0x..."
 */
export async function resolveAgentAddress(ensName: string): Promise<string | null> {
  try {
    const address = await ensPublicClient.getEnsAddress({ name: ensName });
    return address ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up the full ENS name for a given 0G wallet address (reverse resolution).
 */
export async function lookupAgentName(address: string): Promise<string | null> {
  try {
    const name = await ensPublicClient.getEnsName({ address: address as `0x${string}` });
    return name ?? null;
  } catch {
    return null;
  }
}

/**
 * Get all text records for an agent's ENS name.
 */
export async function getAgentMetadata(ensName: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const keys = Object.values(ENS_KEYS);
    await Promise.all(
      keys.map(async (key) => {
        const value = await ensPublicClient.getEnsText({ name: ensName, key }).catch(() => null);
        if (value) result[key] = value;
      }),
    );
  } catch (err) {
    console.error("[ens] getAgentMetadata failed:", err);
  }
  return result;
}

// ── ENS registration (via ENS Registry setSubnodeRecord) ──────────────────────
//
// talos.eth is owned directly by our registrar wallet in the ENS Registry
// (verified on-chain: owner = 0x71197e7a1CA5A2cb2AD82432B924F69B1E3dB123).
// We create subnames via Registry.setSubnodeRecord(), then set address + text
// records on the Public Resolver.

export interface RegisterAgentEnsParams {
  agentName: string;      // e.g. "vega" → registers "vega.talos.eth"
  ownerAddress: string;   // Agent's 0G wallet address
  talosId: string;
  category?: string;
  persona?: string;
  serviceUrl?: string;
}

const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

const RegistryAbi = [
  {
    name: "setSubnodeRecord",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [],
  },
  {
    name: "setOwner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "owner", type: "address" },
    ],
    outputs: [],
  },
] as const;

const ResolverAbi = [
  {
    name: "setAddr",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "node", type: "bytes32" }, { name: "addr", type: "address" }],
    outputs: [],
  },
  {
    name: "setText",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }],
    outputs: [],
  },
] as const;

/**
 * Register {agentName}.talos.eth via ENS Registry (no NameWrapper needed).
 * talos.eth owner is our registrar wallet — we create subnames directly.
 */
export async function registerAgentEns(
  params: RegisterAgentEnsParams,
): Promise<{ txHash: string; ensName: string } | null> {
  if (!ENS_REGISTRAR_KEY) {
    console.warn("[ens] ENS_REGISTRAR_PRIVATE_KEY not set — skipping ENS registration");
    return null;
  }

  const ensName = `${params.agentName}.${ENS_PARENT_DOMAIN}`;
  const PUBLIC_RESOLVER = (ENS_NETWORK === "mainnet"
    ? "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63"
    : "0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5") as `0x${string}`;

  try {
    const { createWalletClient } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { namehash, labelhash } = await import("viem/ens");

    const hex = ENS_REGISTRAR_KEY.startsWith("0x")
      ? (ENS_REGISTRAR_KEY as `0x${string}`)
      : (`0x${ENS_REGISTRAR_KEY}` as `0x${string}`);

    const account = privateKeyToAccount(hex);
    const rpc = ENS_NETWORK === "mainnet"
      ? (process.env.ETH_MAINNET_RPC ?? "https://eth.llamarpc.com")
      : (process.env.ETH_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com");

    const walletClient = createWalletClient({ account, chain: ensChain, transport: http(rpc) });

    const parentNode = namehash(ENS_PARENT_DOMAIN);
    const label = labelhash(params.agentName);
    const subNode = namehash(ensName);

    // 1. Create subname: Registry.setSubnodeRecord(parentNode, label, owner, resolver, ttl)
    //    Owner = our registrar (so we can set records), then transfer to agent
    const txHash = await walletClient.writeContract({
      address: ENS_REGISTRY_ADDRESS,
      abi: RegistryAbi,
      functionName: "setSubnodeRecord",
      args: [parentNode, label, account.address, PUBLIC_RESOLVER, BigInt(0)],
    });
    await ensPublicClient.waitForTransactionReceipt({ hash: txHash });

    // 2. Set address record → agent's 0G wallet
    const addrTx = await walletClient.writeContract({
      address: PUBLIC_RESOLVER,
      abi: ResolverAbi,
      functionName: "setAddr",
      args: [subNode, params.ownerAddress as `0x${string}`],
    });
    await ensPublicClient.waitForTransactionReceipt({ hash: addrTx });

    // 3. Set key text records sequentially (wait for each to avoid nonce issues)
    const textRecords: [string, string][] = [
      [ENS_KEYS.TALOS_ID, params.talosId],
      [ENS_KEYS.WALLET, params.ownerAddress],
      [ENS_KEYS.PROTOCOL, "talos-v1"],
    ];
    if (params.category) textRecords.push([ENS_KEYS.CATEGORY, params.category]);

    for (const [key, value] of textRecords) {
      try {
        const txtTx = await walletClient.writeContract({
          address: PUBLIC_RESOLVER,
          abi: ResolverAbi,
          functionName: "setText",
          args: [subNode, key, value],
        });
        await ensPublicClient.waitForTransactionReceipt({ hash: txtTx });
      } catch {
        // Non-critical — addr record is what matters for resolution
      }
    }

    // 4. Transfer ENS subname ownership to agent wallet
    //    Records are already set — now the agent wallet truly owns its ENS name
    try {
      const ownerTx = await walletClient.writeContract({
        address: ENS_REGISTRY_ADDRESS,
        abi: RegistryAbi,
        functionName: "setOwner",
        args: [subNode, params.ownerAddress as `0x${string}`],
      });
      await ensPublicClient.waitForTransactionReceipt({ hash: ownerTx });
      console.log(`[ens] Ownership transferred: ${ensName} → ${params.ownerAddress}`);
    } catch {
      // Non-critical — name still resolves correctly even if ownership transfer fails
      console.warn(`[ens] Ownership transfer failed for ${ensName} — operator retains control`);
    }

    console.log(`[ens] Registered ${ensName} → ${params.ownerAddress} (tx: ${txHash})`);
    return { txHash, ensName };
  } catch (err) {
    console.error("[ens] registerAgentEns failed:", err);
    return null;
  }
}

/**
 * Check if an ENS subname is already taken.
 */
export async function isAgentEnsAvailable(agentName: string): Promise<boolean> {
  const ensName = `${agentName}.${ENS_PARENT_DOMAIN}`;
  try {
    const address = await ensPublicClient.getEnsAddress({ name: ensName });
    return address === null;
  } catch {
    return true; // Assume available if resolution fails
  }
}

/**
 * Build the full ENS name for an agent.
 */
export function buildAgentEnsName(agentName: string): string {
  return `${agentName}.${ENS_PARENT_DOMAIN}`;
}

/**
 * Discover agents by ENS subname pattern.
 * Returns a list of known Talos agents with their metadata.
 */
export async function discoverAgentsByEns(
  agentNames: string[],
): Promise<Array<{ ensName: string; address: string; metadata: Record<string, string> }>> {
  const results = await Promise.all(
    agentNames.map(async (name) => {
      const ensName = buildAgentEnsName(name);
      const [address, metadata] = await Promise.all([
        resolveAgentAddress(ensName),
        getAgentMetadata(ensName),
      ]);
      if (!address) return null;
      return { ensName, address, metadata };
    }),
  );
  return results.filter(Boolean) as Array<{ ensName: string; address: string; metadata: Record<string, string> }>;
}
