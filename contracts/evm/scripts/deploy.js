const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("▶  Deploying with:", deployer.address);
  console.log("   Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH/INIT");

  // ── TalosRegistry ────────────────────────────────────────────────────────
  console.log("\n▶  Deploying TalosRegistry...");
  const Registry = await ethers.getContractFactory("TalosRegistry");
  const registry = await Registry.deploy(
    deployer.address, // protocolWallet
    300               // 3% fee in bps
  );
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("   TalosRegistry:", registryAddr);

  // ── TalosNameService ─────────────────────────────────────────────────────
  console.log("\n▶  Deploying TalosNameService...");
  const NameService = await ethers.getContractFactory("TalosNameService");
  const nameService = await NameService.deploy();
  await nameService.waitForDeployment();
  const nameServiceAddr = await nameService.getAddress();
  console.log("   TalosNameService:", nameServiceAddr);

  // ── Save addresses ────────────────────────────────────────────────────────
  const addresses = {
    TalosRegistry: registryAddr,
    TalosNameService: nameServiceAddr,
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("\n   Saved to deployed-addresses.json");

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  web/.env.local'a ekle:\n");
  console.log(`  NEXT_PUBLIC_TALOS_REGISTRY_CONTRACT=${registryAddr}`);
  console.log(`  NEXT_PUBLIC_TALOS_NAME_SERVICE_CONTRACT=${nameServiceAddr}`);
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
