// Sentry — browser runtime. Next.js loads this on the client. Uses the
// NEXT_PUBLIC_ DSN (exposed to the browser) and stays inert until it's set.
// Events tunnel through the same-origin /monitoring route (tunnelRoute in
// next.config), so the app's `connect-src 'self'` CSP already permits them.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 1,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
