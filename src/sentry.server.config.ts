// Sentry — server runtime (Node). Loaded by src/instrumentation.ts on the
// nodejs runtime. Inert until SENTRY_DSN is set: with no DSN, `enabled: false`
// means the SDK never initializes a transport and sends nothing, so this adds
// no overhead in environments (incl. local dev) that haven't opted in.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  // Capture 100% of transactions at this scale (<10 users). Dial down if volume grows.
  tracesSampleRate: 1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
