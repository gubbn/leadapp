import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse loads pdf.js and its worker at runtime. Keeping it external prevents
  // Turbopack from relocating the worker away from the package at build time.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
