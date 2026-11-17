import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    agentUpgrade: 'security',
  },
  /* config options here */
};

export default nextConfig;
