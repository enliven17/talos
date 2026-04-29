import type { NextConfig } from "next";
import { existsSync } from "fs";
import path from "path";

const monorepoRoot = path.join(__dirname, "..");
const outputFileTracingRoot = existsSync(path.join(monorepoRoot, "pnpm-workspace.yaml"))
  ? monorepoRoot
  : undefined;

const nextConfig: NextConfig = {
  ...(outputFileTracingRoot ? { outputFileTracingRoot } : {}),
  transpilePackages: [
    "@initia/interwovenkit-react",
    "@initia/utils",
    "@initia/amino-converter",
    "@noble/hashes",
    "connectkit",
  ],
};

export default nextConfig;
