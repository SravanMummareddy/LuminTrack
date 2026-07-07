import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy — shipped in *Report-Only* first. `script-src` and
// `style-src` allow 'unsafe-inline' because Next injects inline hydration
// scripts and the app uses inline `style={{…}}` heavily; a nonce-based strict
// policy is a larger follow-up. Everything else is locked to same-origin:
// `default-src 'self'` blocks external resource loads, `frame-ancestors 'self'`
// backs up X-Frame-Options against clickjacking, `object-src 'none'` kills
// plugin embeds, and `base-uri`/`form-action` are pinned. Résumé/document PDFs
// are served same-origin via /api/*, so `frame-src 'self'` + `img-src blob:`
// cover the inline preview. Promote to `Content-Security-Policy` (enforcing)
// once the console shows no violations in a real-browser pass.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Applied to every route. HSTS only bites over HTTPS (prod); inert on local http.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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

// Sentry wrapping. Source-map upload is disabled (no auth token yet, and
// Turbopack builds it separately) — enable it later by setting SENTRY_AUTH_TOKEN
// and flipping `sourcemaps.disable`. `tunnelRoute` proxies browser events
// through a same-origin route so they aren't blocked by ad-blockers or the
// app's `connect-src 'self'` CSP. All of this is a no-op at runtime until a DSN
// is configured (see the sentry.*.config files).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  sourcemaps: { disable: true },
  tunnelRoute: "/monitoring",
});
