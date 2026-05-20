import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/ext",
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [],
};

export default nextConfig;
