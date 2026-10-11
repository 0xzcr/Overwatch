import type { NextConfig } from "next";
import "@overwatch/db/env";

const config: NextConfig = {
  transpilePackages: ["@overwatch/core", "@overwatch/db", "@overwatch/sdk", "@overwatch/demo", "@overwatch/solana"],
  serverExternalPackages: ["postgres", "@sqds/multisig", "@solana/spl-token"],
  env: { NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? "false" },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};
export default config;
