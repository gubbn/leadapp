import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse loads its worker and native canvas implementation at runtime.
  // Keeping both external lets serverless deployments resolve their packaged files.
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
};

export default nextConfig;
