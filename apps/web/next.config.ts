import type { NextConfig } from "next";
import "@overwatch/db/env";

const config: NextConfig = {
  transpilePackages: ["@overwatch/core", "@overwatch/db", "@overwatch/sdk", "@overwatch/solana"],
  serverExternalPackages: ["postgres", "@sqds/multisig"],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [{ source: "/case/drift", destination: "/case-study", permanent: true }];
  },
};
export default config;
