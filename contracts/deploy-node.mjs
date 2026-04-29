/**
 * CosmWasm contract deployer — Node.js, initiad CLI gerekmez.
 * Usage: node deploy-node.mjs
 *
 * Env vars (or set directly below):
 *   INITIA_OPERATOR_SECRET  — 0x... private key veya BIP39 mnemonic
 *   INITIA_RPC_URL          — default: https://rpc.testnet.initia.xyz
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL =
  process.env.INITIA_RPC_URL ?? "https://rpc.testnet.initia.xyz";
const CHAIN_ID = process.env.INITIA_CHAIN_ID ?? "initiation-2";
const OPERATOR_SECRET =
  process.env.INITIA_OPERATOR_SECRET ??
  "0xc53e6c45dfce6b643c0c27831e9d9f3db3b4c9156960418f002299283bd6e478";

const REGISTRY_WASM = join(
  __dir,
  "target/wasm32-unknown-unknown/release/talos_registry.wasm"
);
const NAME_SERVICE_WASM = join(
  __dir,
  "target/wasm32-unknown-unknown/release/talos_name_service.wasm"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getSigner(secret) {
  const { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } = await import(
    "@cosmjs/proto-signing"
  );
  const trimmed = secret.trim();
  if (trimmed.includes(" ")) {
    return DirectSecp256k1HdWallet.fromMnemonic(trimmed, { prefix: "init" });
  }
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  return DirectSecp256k1Wallet.fromKey(Buffer.from(hex, "hex"), "init");
}

async function storeContract(client, signerAddress, wasmPath) {
  const wasmBytes = readFileSync(wasmPath);
  console.log(`  Uploading ${wasmPath.split(/[/\\]/).pop()} (${wasmBytes.length} bytes)...`);
  const result = await client.upload(
    signerAddress,
    wasmBytes,
    { amount: [{ denom: "uinit", amount: "600000" }], gas: "4000000" }
  );
  console.log(`  TX: ${result.transactionHash}`);
  return result.codeId;
}

async function instantiateContract(client, signerAddress, codeId, initMsg, label) {
  console.log(`  Instantiating ${label} (code ${codeId})...`);
  const result = await client.instantiate(
    signerAddress,
    codeId,
    initMsg,
    label,
    { amount: [{ denom: "uinit", amount: "100000" }], gas: "500000" }
  );
  console.log(`  TX: ${result.transactionHash}`);
  return result.contractAddress;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { SigningCosmWasmClient } = await import("@cosmjs/cosmwasm-stargate");
  const { GasPrice } = await import("@cosmjs/stargate");

  console.log("▶  Connecting to", RPC_URL);
  const wallet = await getSigner(OPERATOR_SECRET);
  const [account] = await wallet.getAccounts();
  console.log("   Deployer:", account.address);

  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GasPrice.fromString("0.015uinit"),
  });

  const balance = await client.getBalance(account.address, "uinit");
  console.log("   Balance:", balance.amount, "uinit");
  if (parseInt(balance.amount) < 1_000_000) {
    console.warn(
      "⚠  Low balance. Fund via https://faucet.testnet.initia.xyz/ with address:",
      account.address
    );
  }

  // ── TalosRegistry ──────────────────────────────────────────────────────────
  console.log("\n▶  TalosRegistry");
  const registryCodeId = await storeContract(client, account.address, REGISTRY_WASM);
  console.log("   Code ID:", registryCodeId);

  const registryAddr = await instantiateContract(
    client,
    account.address,
    registryCodeId,
    { protocol_wallet: account.address, protocol_fee_bps: 300 },
    "TalosRegistry"
  );
  console.log("   Address:", registryAddr);

  // ── TalosNameService ───────────────────────────────────────────────────────
  console.log("\n▶  TalosNameService");
  const nameCodeId = await storeContract(client, account.address, NAME_SERVICE_WASM);
  console.log("   Code ID:", nameCodeId);

  const nameAddr = await instantiateContract(
    client,
    account.address,
    nameCodeId,
    {},
    "TalosNameService"
  );
  console.log("   Address:", nameAddr);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  web/.env.local'a ekle:\n");
  console.log(`  NEXT_PUBLIC_TALOS_REGISTRY_CONTRACT=${registryAddr}`);
  console.log(`  NEXT_PUBLIC_TALOS_NAME_SERVICE_CONTRACT=${nameAddr}`);
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Deploy failed:", e.message);
  process.exit(1);
});
