// Next.js instrumentation hook. `register()` loads the right Sentry init for
// the current runtime; `onRequestError` forwards uncaught server errors
// (Server Components, route handlers, server actions) to Sentry. All inert
// until SENTRY_DSN is set — see sentry.server/edge.config.ts.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
