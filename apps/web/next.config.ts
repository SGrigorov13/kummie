import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "../..");

const config: NextConfig = {
  // cPanel (Passenger) runs the standalone server; builds happen in GitHub Actions (ARCHITECTURE §10).
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@kummie/core", "@kummie/brand", "@kummie/i18n"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
