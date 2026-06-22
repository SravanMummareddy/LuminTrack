import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is regularly reached over the LAN (e.g. from an iPad at
  // http://192.168.1.219:3000) rather than localhost. Next.js 16 treats a
  // non-localhost Host as a cross-origin request and BLOCKS the `/_next/*`
  // dev resources — including the `/_next/webpack-hmr` WebSocket. A blocked
  // HMR connection stops the client from hydrating, so client interactivity
  // (e.g. the Filters expand/collapse toggle) silently fails. Allowlist the
  // hosts we develop from so the HMR handshake completes and the page hydrates.
  // Only affects `next dev`; has no effect on production.
  allowedDevOrigins: ["192.168.1.219", "127.0.0.1"],
};

export default nextConfig;
