// Sentry — edge runtime (proxy/middleware, edge routes). Loaded by
// src/instrumentation.ts on the edge runtime. Inert until SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
