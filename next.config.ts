import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: "**/.playwright-cli/**",
      };
    }

    return config;
  },
};

export default nextConfig;
