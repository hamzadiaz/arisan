import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
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
