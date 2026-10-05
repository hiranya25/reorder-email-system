import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@reorder/core", "@reorder/email"],
};

export default nextConfig;
