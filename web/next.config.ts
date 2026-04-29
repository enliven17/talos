import type { NextConfig } from "next";
import { existsSync } from "fs";
import path from "path";

const monorepoRoot = path.join(__dirname, "..");
const outputFileTracingRoot = existsSync(path.join(monorepoRoot, "pnpm-workspace.yaml"))
  ? monorepoRoot
  : undefined;

// ConnectKit 1.9.x was built against @wagmi/connectors (separate package in wagmi v1).
// In wagmi v2 connectors live in wagmi/connectors — alias both ways.
const wagmiConnectorsPath = path.resolve(__dirname, "node_modules/wagmi/dist/esm/exports/connectors.js");

const nextConfig: NextConfig = {
  ...(outputFileTracingRoot ? { outputFileTracingRoot } : {}),
  transpilePackages: [
    "@initia/interwovenkit-react",
    "@initia/utils",
    "@initia/amino-converter",
    "@noble/hashes",
    "connectkit",
  ],
  // Turbopack aliases (dev server)
  experimental: {
    turbo: {
      resolveAlias: {
        "@wagmi/connectors": wagmiConnectorsPath,
        "@aave/account": wagmiConnectorsPath,
      },
    },
  },
  // Webpack aliases (build)
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wagmi/connectors": wagmiConnectorsPath,
      "@aave/account": wagmiConnectorsPath,
    };
    return config;
  },
};

export default nextConfig;
