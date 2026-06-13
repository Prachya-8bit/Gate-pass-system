import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the multi-stage Dockerfile — produces .next/standalone,
  // a self-contained Node server (no node_modules needed at runtime).
  output: 'standalone',
};

export default nextConfig;
