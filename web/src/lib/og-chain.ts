/**
 * 0G Chain (EVM) — contract interactions for Talos Protocol.
 * 0G Galileo Testnet: chainId 16602
 * RPC: https://evmrpc-testnet.0g.ai
 */

import { createPublicClient, createWalletClient, http, defineChain, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// ── Chain definition ─────────────────────────────────────────────────────────

export const ogChain = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "A0GI", symbol: "A0GI", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://evmrpc-testnet.0g.ai/v1"] },
  },
  blockExplorers: {
    default: {
      name: "0G Explorer",
      url: "https://chainscan-galileo.0g.ai",
    },
  },
  testnet: true,
});

// ── Contract addresses ───────────────────────────────────────────────────────

export const REGISTRY_ADDRESS =
  (process.env.NEXT_PUBLIC_TALOS_REGISTRY_CONTRACT as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export const NAME_SERVICE_ADDRESS =
  (process.env.NEXT_PUBLIC_TALOS_NAME_SERVICE_CONTRACT as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

// ── ABIs ─────────────────────────────────────────────────────────────────────

export const REGISTRY_ABI = parseAbi([
  "function createTalos(string name, string category, string description, (uint32 creatorShare, uint32 investorShare, uint32 treasuryShare, string creatorAddr, string investorAddr, string treasuryAddr) patron, (uint256 approvalThreshold, uint256 gtmBudget, uint256 minPatronPulse) kernel, (uint256 totalSupply, uint256 priceA0gi, string tokenSymbol) pulse) returns (uint64 talosId)",
  "function getTalos(uint64 talosId) view returns ((uint64 id, string name, string category, string description, string creator, (uint32 creatorShare, uint32 investorShare, uint32 treasuryShare, string creatorAddr, string investorAddr, string treasuryAddr) patron, (uint256 approvalThreshold, uint256 gtmBudget, uint256 minPatronPulse) kernel, (uint256 totalSupply, uint256 priceA0gi, string tokenSymbol) pulse, uint64 createdAt, bool active))",
  "function isActive(uint64 talosId) view returns (bool)",
  "function creatorOf(uint64 talosId) view returns (string)",
  "function nextId() view returns (uint64)",
  "event TalosCreated(uint64 indexed talosId, string creator)",
]);

export const NAME_SERVICE_ABI = parseAbi([
  "function registerName(uint64 talosId, string name)",
  "function resolveName(string name) view returns (uint64)",
  "function nameOf(uint64 talosId) view returns (string)",
  "function isNameAvailable(string name) view returns (bool)",
  "function hasName(uint64 talosId) view returns (bool)",
]);

// ── Clients ──────────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: ogChain,
  transport: http(),
});

function getWalletClient() {
  const secret = process.env.OG_OPERATOR_PRIVATE_KEY;
  if (!secret) throw new Error("OG_OPERATOR_PRIVATE_KEY not set");
  const hex = secret.startsWith("0x") ? (secret as `0x${string}`) : (`0x${secret}` as `0x${string}`);
  const account = privateKeyToAccount(hex);
  return createWalletClient({ account, chain: ogChain, transport: http() });
}

// ── Registry operations ──────────────────────────────────────────────────────

export interface CreateTalosParams {
  name: string;
  category: string;
  description: string;
  creatorAddr: string;
  investorAddr?: string;
  treasuryAddr?: string;
  approvalThreshold?: number;
  gtmBudget?: number;
  minPatronPulse?: number;
  totalSupply?: number;
  priceA0gi?: number;
  tokenSymbol?: string;
}

export async function createTalosOnChain(
  params: CreateTalosParams,
): Promise<{ txHash: string; onChainId: bigint } | null> {
  const contractAddr = REGISTRY_ADDRESS;
  if (!contractAddr || contractAddr === "0x0000000000000000000000000000000000000000") {
    return null; // Not deployed yet
  }
  try {
    const walletClient = getWalletClient();
    const { request } = await publicClient.simulateContract({
      account: walletClient.account,
      address: contractAddr,
      abi: REGISTRY_ABI,
      functionName: "createTalos",
      args: [
        params.name,
        params.category,
        params.description,
        {
          creatorShare: 0,
          investorShare: 0,
          treasuryShare: 100,
          creatorAddr: params.creatorAddr,
          investorAddr: params.investorAddr ?? "",
          treasuryAddr: params.treasuryAddr ?? "",
        },
        {
          approvalThreshold: BigInt(params.approvalThreshold ?? 10),
          gtmBudget: BigInt(params.gtmBudget ?? 200),
          minPatronPulse: BigInt(params.minPatronPulse ?? 0),
        },
        {
          totalSupply: BigInt(params.totalSupply ?? 1000000),
          priceA0gi: BigInt(params.priceA0gi ?? 0),
          tokenSymbol: params.tokenSymbol ?? "",
        },
      ],
    });

    const txHash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const nextId = await publicClient.readContract({
      address: contractAddr,
      abi: REGISTRY_ABI,
      functionName: "nextId",
    });
    const onChainId = nextId - BigInt(1);

    return { txHash, onChainId };
  } catch (err) {
    console.error("[og-chain] createTalosOnChain failed:", err);
    return null;
  }
}

export async function registerNameOnChain(
  talosId: bigint,
  name: string,
): Promise<{ txHash: string } | null> {
  const contractAddr = NAME_SERVICE_ADDRESS;
  if (!contractAddr || contractAddr === "0x0000000000000000000000000000000000000000") return null;
  try {
    const walletClient = getWalletClient();
    const { request } = await publicClient.simulateContract({
      account: walletClient.account,
      address: contractAddr,
      abi: NAME_SERVICE_ABI,
      functionName: "registerName",
      args: [talosId, name],
    });
    const txHash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  } catch (err) {
    console.error("[og-chain] registerNameOnChain failed:", err);
    return null;
  }
}

export async function isNameAvailable(name: string): Promise<boolean> {
  const contractAddr = NAME_SERVICE_ADDRESS;
  if (!contractAddr || contractAddr === "0x0000000000000000000000000000000000000000") {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && !/--/.test(name);
  }
  try {
    return (await publicClient.readContract({
      address: contractAddr,
      abi: NAME_SERVICE_ABI,
      functionName: "isNameAvailable",
      args: [name],
    })) as boolean;
  } catch {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && !/--/.test(name);
  }
}

export async function resolveNameOnChain(name: string): Promise<bigint | null> {
  const contractAddr = NAME_SERVICE_ADDRESS;
  if (!contractAddr || contractAddr === "0x0000000000000000000000000000000000000000") return null;
  try {
    const id = (await publicClient.readContract({
      address: contractAddr,
      abi: NAME_SERVICE_ABI,
      functionName: "resolveName",
      args: [name],
    })) as bigint;
    return id > BigInt(0) ? id : null;
  } catch {
    return null;
  }
}

// ── Wallet helpers ────────────────────────────────────────────────────────────

/**
 * Generate a new EVM keypair for an agent wallet (called during TALOS Genesis).
 * Returns { address, privateKey }.
 * Store address in DB as agentWalletAddress.
 * Store privateKey server-side ONLY (env var or secret manager).
 */
export function createAgentKeypair(): { address: string; privateKey: string } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

/**
 * Fund a new agent wallet from the 0G Galileo faucet (best-effort).
 */
export async function fundTestnetAccount(address: string): Promise<void> {
  try {
    const res = await fetch("https://faucet.0g.ai/api/faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (res.ok) {
      console.log(`[og-chain] Faucet funded ${address}`);
    } else {
      console.warn(`[og-chain] Faucet returned ${res.status} for ${address}`);
    }
  } catch (err) {
    console.warn("[og-chain] Faucet request failed:", err);
  }
}

/**
 * Get A0GI balance for an EVM address (in wei).
 */
export async function getA0GIBalance(address: string): Promise<bigint> {
  try {
    return await publicClient.getBalance({ address: address as `0x${string}` });
  } catch {
    return BigInt(0);
  }
}

/**
 * Send A0GI from agent wallet to recipient.
 * Amount in A0GI (human-readable, e.g. "1.5").
 */
export async function sendA0GI(
  fromPrivateKey: string,
  toAddress: string,
  amountA0GI: string,
): Promise<{ txHash: string }> {
  const { parseEther } = await import("viem");
  const hex = fromPrivateKey.startsWith("0x")
    ? (fromPrivateKey as `0x${string}`)
    : (`0x${fromPrivateKey}` as `0x${string}`);
  const account = privateKeyToAccount(hex);
  const walletClient = createWalletClient({ account, chain: ogChain, transport: http() });
  const txHash = await walletClient.sendTransaction({
    to: toAddress as `0x${string}`,
    value: parseEther(amountA0GI),
  });
  return { txHash };
}

/**
 * Validate that an address is a valid EVM address (0x + 40 hex chars).
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Record an approval decision on-chain (minimal self-transfer with memo via tx data).
 */
export async function recordApprovalOnChain(
  approvalId: string,
  talosId: string,
  status: "approved" | "rejected",
): Promise<{ txHash: string } | null> {
  const operatorKey = process.env.OG_OPERATOR_PRIVATE_KEY;
  if (!operatorKey) return null;
  try {
    const { encodePacked, keccak256, stringToHex } = await import("viem");
    const memo = `${talosId.slice(0, 8)}:${approvalId.slice(0, 8)}:${status.slice(0, 1)}`;
    const hex = operatorKey.startsWith("0x")
      ? (operatorKey as `0x${string}`)
      : (`0x${operatorKey}` as `0x${string}`);
    const account = privateKeyToAccount(hex);
    const walletClient = createWalletClient({ account, chain: ogChain, transport: http() });
    const txHash = await walletClient.sendTransaction({
      to: account.address,
      value: BigInt(0),
      data: stringToHex(memo),
    });
    return { txHash };
  } catch (err) {
    console.error("[og-chain] recordApprovalOnChain failed:", err);
    return null;
  }
}

// ── Payment helpers ───────────────────────────────────────────────────────────

/**
 * Sign an EVM payment transaction (A0GI transfer) for agent-to-agent payments.
 * Returns a serialized signed transaction as the payment token.
 */
export async function signA0GIPayment(
  agentPrivateKey: string,
  to: string,
  amountA0GI: string,
): Promise<{ paymentToken: string }> {
  const { parseEther, serializeTransaction, parseGwei } = await import("viem");
  const hex = agentPrivateKey.startsWith("0x")
    ? (agentPrivateKey as `0x${string}`)
    : (`0x${agentPrivateKey}` as `0x${string}`);
  const account = privateKeyToAccount(hex);
  const walletClient = createWalletClient({ account, chain: ogChain, transport: http() });

  const nonce = await publicClient.getTransactionCount({ address: account.address });
  const gasPrice = await publicClient.getGasPrice();

  const request = await walletClient.prepareTransactionRequest({
    to: to as `0x${string}`,
    value: parseEther(amountA0GI),
    nonce,
  });

  const serialized = await walletClient.signTransaction(request);
  return { paymentToken: serialized };
}

/**
 * Verify a signed payment token by decoding the raw transaction.
 * Checks recipient address and minimum amount.
 */
export async function verifyA0GIPayment(
  paymentToken: string,
  expectedTo: string,
  expectedAmountA0GI: string,
): Promise<boolean> {
  try {
    const { parseTransaction, parseEther, formatEther } = await import("viem");
    const tx = parseTransaction(paymentToken as `0x${string}`);
    if (!tx.to || tx.to.toLowerCase() !== expectedTo.toLowerCase()) return false;
    const expected = parseEther(expectedAmountA0GI);
    return (tx.value ?? BigInt(0)) >= expected;
  } catch {
    return false;
  }
}

/**
 * Broadcast a signed payment transaction to 0G Chain.
 */
export async function broadcastA0GIPayment(
  paymentToken: string,
): Promise<{ txHash: string }> {
  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: paymentToken as `0x${string}`,
  });
  return { txHash };
}

/**
 * Verify a payment by querying the 0G Chain with a tx hash.
 */
export async function verifyTxByHash(
  txHash: string,
  expectedTo: string,
  expectedAmountA0GI: string,
): Promise<boolean> {
  const { parseEther } = await import("viem");
  // Retry up to 4 times — 0G Galileo testnet can be slow to index
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      if (!receipt) continue;
      if (receipt.status === "reverted") return false;
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      if (tx.to?.toLowerCase() !== expectedTo.toLowerCase()) return false;
      // Accept if amount >= expected (with 10% tolerance for gas adjustments)
      const expected = parseEther(expectedAmountA0GI);
      const tolerance = expected / 10n;
      return (tx.value ?? BigInt(0)) >= expected - tolerance;
    } catch {
      // retry
    }
  }
  return false;
}
