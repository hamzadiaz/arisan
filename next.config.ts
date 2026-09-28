import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // The E2E gate builds into its own directory so it never clobbers a running build
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // CLOCK IN mobile shell: the old desktop routes fold into the wallet-first home
  async redirects() {
    return ["/auth", "/dashboard/:path*", "/pools", "/profile", "/settings"].map((source) => ({
      source,
      destination: "/",
      permanent: false,
    }));
  },
};

export default nextConfig;
