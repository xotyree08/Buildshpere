import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production bundle (.next/standalone) so the app deploys
  // to any Node host or container without node_modules — Vercel ignores
  // this and does its own thing, so both paths stay open.
  output: "standalone",
};

export default nextConfig;
