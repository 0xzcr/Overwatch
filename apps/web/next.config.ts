import type { NextConfig } from "next";
import "@overwatch/db/env";

const config: NextConfig = {
  transpilePackages: ["@overwatch/core", "@overwatch/db", "@overwatch/sdk", "@overwatch/demo", "@overwatch/solana"],
  serverExternalPackages: ["postgres", "@sqds/multisig", "@solana/spl-token"],
  env: { NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? "false" },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  // The site is a single page now. Old routes (linked from the Telegram bot and alert emails) land on the matching section.
  async redirects() {
    return [
      { source: "/protocols", destination: "/#control-map", permanent: false },
      { source: "/protocols/:slug", destination: "/#protocol/:slug", permanent: false },
      { source: "/events", destination: "/#control-map", permanent: false },
      { source: "/case/drift", destination: "/#drift", permanent: false },
      { source: "/methodology", destination: "/#score", permanent: false },
      { source: "/docs/api", destination: "/#build", permanent: false },
      { source: "/alerts", destination: "/#warn", permanent: false },
      { source: "/demo", destination: "/#act", permanent: false },
      { source: "/vault", destination: "/#act", permanent: false },
    ];
  },
};
export default config;
