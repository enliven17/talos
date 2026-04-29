require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../../web/.env.local" });

const PRIVATE_KEY = process.env.OG_OPERATOR_PRIVATE_KEY ?? "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    // 0G Galileo Testnet — EVM compatible
    og_galileo: {
      url: "https://evmrpc-testnet.0g.ai/v1",
      chainId: 16602,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      og_galileo: "no-api-key",
    },
    customChains: [
      {
        network: "og_galileo",
        chainId: 16601,
        urls: {
          apiURL: "https://chainscan-galileo.0g.ai/api",
          browserURL: "https://chainscan-galileo.0g.ai",
        },
      },
    ],
  },
};
