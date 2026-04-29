import type { NextConfig } from "next";
import { existsSync } from "fs";
import path from "path";

const monorepoRoot = path.join(__dirname, "..");
const outputFileTracingRoot = existsSync(path.join(monorepoRoot, "pnpm-workspace.yaml"))
  ? monorepoRoot
  : undefined;

// Real @wagmi/connectors is in the pnpm store, not hoisted to web/node_modules.
// We alias it so webpack can find it at build time.
const realWagmiConnectors = path.resolve(
  __dirname,
  "../node_modules/.pnpm/node_modules/@wagmi/connectors/dist/esm/exports/index.js"
);
const aaveAccountStub = path.resolve(__dirname, "node_modules/@aave/account/index.js");

const nextConfig: NextConfig = {
  ...(outputFileTracingRoot ? { outputFileTracingRoot } : {}),
  transpilePackages: [
    "@initia/interwovenkit-react",
    "@initia/utils",
    "@initia/amino-converter",
    "@noble/hashes",
    "connectkit",
  ],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wagmi/connectors": realWagmiConnectors,
      "@aave/account": aaveAccountStub,
    };
    return config;
  },
};

export default nextConfig;
