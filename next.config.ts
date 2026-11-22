import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "nudge\\.zaydkrunz\\.com" }],
        destination: "https://nudge.wiki/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
