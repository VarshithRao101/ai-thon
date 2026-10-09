import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (deploy/docker).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
