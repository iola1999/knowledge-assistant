import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@anchordesk/auth",
    "@anchordesk/db",
    "@anchordesk/queue",
    "@anchordesk/storage",
  ],
};

export default nextConfig;
