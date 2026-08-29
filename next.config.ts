import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/terminal", permanent: false },
    ];
  },
};

export default nextConfig;
