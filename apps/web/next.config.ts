import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@law-doc/auth",
    "@law-doc/db",
    "@law-doc/queue",
    "@law-doc/storage",
  ],
};

export default nextConfig;
