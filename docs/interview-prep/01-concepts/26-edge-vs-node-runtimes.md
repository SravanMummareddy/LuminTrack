# 26 — Edge vs Node runtimes (and Fluid Compute)

> **In plain English.** Your server code can run in two different
> environments. *Node* is the full Node.js — every npm package
> works, including native bindings, but cold starts are slower.
> *Edge* is a stripped-down V8 environment that boots fast and
> runs close to the user, but can't use most native packages.
> Vercel's "Fluid Compute" is a newer model that reuses instances
> across concurrent requests for fast cold starts with full
> Node.js — the best of both. LuminTrack runs on Fluid by default.

## The technical core

### The three options on Vercel

| Runtime         | Cold start | Region scope | Capabilities                          |
|-----------------|-----------|--------------|---------------------------------------|
| Node.js (Fluid) | Fast (reuse) | Configurable | Full npm, native bindings, long jobs |
| Edge            | Very fast | Global       | Web APIs only, no `fs`, no native     |
| Static          | Instant   | CDN          | No server code                        |

**Fluid Compute** (Vercel, GA) reuses one function instance across
multiple concurrent requests. Bypasses the classic one-request-
per-instance serverless model. Means cold starts are rare, and
the same instance can handle many requests in parallel.

### When you'd choose Edge

- Geographically-distributed reads with tight latency budgets.
- Tiny endpoints (hello-world, redirect, A/B test cookie).
- Middleware / proxy code that runs before every request.

### When you'd choose Node / Fluid

- Anything using a Prisma driver, native bcrypt, file system,
  long-running jobs, streaming, durable workflows.
- The default for full applications.

### Why Prisma's driver adapter matters

Prisma's classic engine is a binary — works in Node, not in Edge.
Driver adapters (`@prisma/adapter-neon`, `@prisma/adapter-pg`)
are pure-JS and run in any runtime. LuminTrack uses
`@prisma/adapter-neon`, so the DB path is runtime-flexible if we
ever needed to move it.

## Where it lives in LuminTrack

- `src/server/db.ts` uses `PrismaNeon` (driver adapter).
- `src/proxy.ts` (renamed middleware in Next 16) — runs at the
  edge by default; verifies the JWT.
- The rest of the app runs on Vercel's default Node runtime
  (Fluid Compute).

## How to talk about it in an interview

**Sample answer (90 sec):**

> "Vercel today offers three runtime tiers — Edge, Node-on-Fluid,
> and static. LuminTrack's pages run on Fluid Compute, which is
> Vercel's newer model that reuses function instances across
> concurrent requests. That gets you fast cold starts with full
> Node.js available, which matters because Prisma and bcrypt both
> need Node. The one piece that *is* edge-friendly is the proxy
> — that's Next 16's renamed middleware in `src/proxy.ts`. It
> verifies the JWT cookie before the request reaches a function,
> so an unauthenticated visitor gets a redirect without
> instantiating the full Node runtime. I used the `jose` JWT
> library specifically because it works in Edge, where
> `jsonwebtoken` doesn't. The Prisma client uses the Neon driver
> adapter, which is pure JS, so the DB path stays runtime-portable
> if we ever needed to move it."

**Expect:**

- "Why is Edge fast on cold start?" → Smaller V8 isolate, no
  Node.js bootstrap, often pre-warmed.
- "What's the trade-off of Fluid Compute reusing instances?" →
  Per-request isolation is weaker; a memory leak in one request
  affects the next. Mitigation: clean shutdown, scope state per
  request.
- "When would you NOT use Vercel?" → Long-running background
  jobs (use a queue worker on a regular VM), real-time
  WebSocket-heavy apps (use a dedicated socket server).

## Mistakes to avoid saying

- ❌ "Edge is always faster." It's lower-latency on cold start;
  steady-state throughput is comparable.
- ❌ "Serverless means one container per request." Not on Fluid.
- ❌ "Edge Functions are recommended by Vercel." They're
  *available*; Fluid Compute is the recommended default in 2026.

## Go deeper

- Vercel docs on [Fluid Compute](https://vercel.com/docs/fluid-compute).
- "What is V8?" — the JS engine underneath Node and Chrome.
- Cloudflare Workers docs — the spiritual predecessor of Edge.
