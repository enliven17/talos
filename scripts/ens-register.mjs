/**
 * Register talos.eth on ENS Sepolia testnet.
 *
 * Process:
 *   1. makeCommitment → commit tx
 *   2. Wait 65 seconds (min commitment age = 60s)
 *   3. register tx with rent payment
 */

import { createPublicClient, createWalletClient, http, parseEther, namehash, labelhash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const PRIVATE_KEY = "0x2a975a6e86c98d3e96927ba685f2e45a7df6363596e30df574c7901f2e2e6cc9";
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// ENS Sepolia contract addresses
const ETH_REGISTRAR_CONTROLLER = "0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B16";
const PUBLIC_RESOLVER = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD";

const NAME = "talos"; // registers talos.eth
const DURATION = 31536000n; // 1 year in seconds
const SECRET = "0x" + "ab".repeat(32); // deterministic secret

const CONTROLLER_ABI = [
  {
    name: "makeCommitment",
    type: "function",
    stateMutability: "pure",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "commit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "register",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "rentPrice",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [{ name: "price", type: "tuple", components: [{ name: "base", type: "uint256" }, { name: "premium", type: "uint256" }] }],
  },
  {
    name: "available",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }],
  },
];

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

console.log("Account:", account.address);

// 1. Check availability
const isAvailable = await publicClient.readContract({
  address: ETH_REGISTRAR_CONTROLLER,
  abi: CONTROLLER_ABI,
  functionName: "available",
  args: [NAME],
});
console.log(`${NAME}.eth available:`, isAvailable);
if (!isAvailable) {
  console.log(`${NAME}.eth is already registered!`);
  process.exit(0);
}

// 2. Get rent price
const price = await publicClient.readContract({
  address: ETH_REGISTRAR_CONTROLLER,
  abi: CONTROLLER_ABI,
  functionName: "rentPrice",
  args: [NAME, DURATION],
});
const totalPrice = price.base + price.premium;
console.log("Rent price (wei):", totalPrice.toString());
console.log("Rent price (ETH):", Number(totalPrice) / 1e18);

// 3. Make commitment
const commitment = await publicClient.readContract({
  address: ETH_REGISTRAR_CONTROLLER,
  abi: CONTROLLER_ABI,
  functionName: "makeCommitment",
  args: [NAME, account.address, DURATION, SECRET, PUBLIC_RESOLVER, [], false, 0],
});
console.log("\nCommitment hash:", commitment);

// 4. Send commit tx
console.log("\nStep 1/3: Sending commit transaction...");
const commitHash = await walletClient.writeContract({
  address: ETH_REGISTRAR_CONTROLLER,
  abi: CONTROLLER_ABI,
  functionName: "commit",
  args: [commitment],
});
console.log("Commit tx:", commitHash);
await publicClient.waitForTransactionReceipt({ hash: commitHash });
console.log("Commit confirmed.");

// 5. Wait 65 seconds
console.log("\nStep 2/3: Waiting 65 seconds (ENS min commitment age)...");
for (let i = 65; i > 0; i -= 5) {
  process.stdout.write(`  ${i}s remaining...\r`);
  await new Promise(r => setTimeout(r, 5000));
}
console.log("\nWait complete.");

// 6. Register
console.log("\nStep 3/3: Registering talos.eth...");
const registerHash = await walletClient.writeContract({
  address: ETH_REGISTRAR_CONTROLLER,
  abi: CONTROLLER_ABI,
  functionName: "register",
  args: [NAME, account.address, DURATION, SECRET, PUBLIC_RESOLVER, [], true, 0],
  value: totalPrice + totalPrice / 10n, // +10% buffer
});
console.log("Register tx:", registerHash);
await publicClient.waitForTransactionReceipt({ hash: registerHash });

console.log("\n✅ talos.eth successfully registered on Sepolia!");
console.log("   Owner:", account.address);
console.log("   ENS App: https://app.ens.domains/talos.eth");
