import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (deploy/docker).
  output: "standalone",
  poweredByHeader: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@flowledger/engine", "@flowledger/ledger"],
};

export default nextConfig;
