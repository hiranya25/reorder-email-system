import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for cPanel (see docs/DEPLOY_CPANEL.md).
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "../.."),
  transpilePackages: ["@reorder/core", "@reorder/email", "@reorder/auth", "@reorder/db"],
};

export default nextConfig;
