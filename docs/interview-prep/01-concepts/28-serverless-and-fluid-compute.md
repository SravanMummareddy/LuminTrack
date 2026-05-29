# 28 — Serverless and Fluid Compute

> **In plain English.** "Serverless" means you don't manage
> servers — the cloud provider spins up a function when a request
> arrives. The old model: one container per request, cold starts
> are slow. The new model (Vercel's Fluid Compute): one container
> handles many concurrent requests, gets reused, and cold starts
> are rare. LuminTrack runs on Fluid by default.

## The technical core

### Classic serverless (think 2018-era AWS Lambda)

```
[Request] → cold start (200-2000ms) → run handler → die
```

- ✅ Pay per request, scale to zero.
- ❌ Cold start latency hurts.
- ❌ One container per concurrent request — burst traffic forks
  many containers, each cold.
- ❌ Stateful resources (DB connections) get re-created every
  invocation. Hence connection-pool problems.

### Modern serverless (Fluid Compute, lots of other names)

```
[Request 1, 2, 3, ...] → one warm container handles all in parallel
```

- ✅ Cold start once, then warm for many requests.
- ✅ DB connection pool reusable across requests.
- ✅ Pay for active CPU time, not wall-clock.
- ❌ Per-request isolation is weaker. A leak in request 1 affects
  request 2.

### Connection pooling on serverless

The classic problem: each cold container opens a DB connection.
1000 concurrent cold containers = 1000 connections, but Postgres
caps at ~100. Crash.

Solutions:
- **Provider-side pooler.** Neon ships PgBouncer-style pooling.
- **Driver-level pool reuse.** Prisma client at module top reuses
  in-process across requests.
- **Fluid Compute itself.** Fewer instances → fewer connections.

### Cold starts deeper

A cold start has three phases:
1. Provision the container (VM-level).
2. Boot the runtime (Node/Edge V8 isolate).
3. Bootstrap your app (imports, DB ping, framework init).

Phase 3 is where bloated `node_modules` hurt. Tree-shake aggressively.

## Where it lives in LuminTrack

- **Module-top Prisma singleton.** `src/server/db.ts` puts
  `prisma` on `globalThis` in dev — reused across hot reloads.
  In prod (Fluid Compute), the same module-top singleton means
  one client per warm instance.
- **Neon driver adapter.** Neon ships serverless-aware connection
  pooling. The pooled URL (`DATABASE_URL`) goes to the app; the
  direct URL (`DIRECT_URL`) goes to the Prisma CLI.
- **In-memory rate-limit Map.** `src/lib/rate-limit.ts` lives on
  the warm instance. Acceptable for the team's scale; on Fluid
  it's per-instance, not global.

## How to talk about it in an interview

**Sample answer (90 sec):**

> "LuminTrack deploys to Vercel and runs on Fluid Compute — the
> newer model where one container handles many concurrent
> requests instead of one-per-request. Two practical
> consequences. First, my Prisma client is a module-top
> singleton stored on `globalThis` in dev, so it gets reused
> across requests and hot reloads. In prod that pattern means one
> client per warm instance, not one per request. Second, my
> in-memory rate-limiter is per-instance — bounded buckets up to
> 5000 entries with drop-oldest eviction. It's adequate for a
> 10-user internal tool, but if I went public I'd swap to Upstash
> Redis for shared state across instances. The classic
> serverless gotcha is connection storms: 1000 cold containers
> each opening a Postgres connection. I avoid that two ways —
> Neon's pooled DATABASE_URL talks to its own PgBouncer-style
> pooler, and the Prisma singleton at module top reuses the
> client across requests on the same instance."

**Expect:**

- "Why not run on EC2 / a VM?" → Operational overhead; Vercel
  manages SSL, scaling, deploys. Not the right call for some
  workloads (long jobs, sockets).
- "When would you NOT pick serverless?" → WebSocket-heavy real-time
  apps, big batch jobs, GPU workloads.
- "What's connection pooling?" → A pool of DB connections shared
  by multiple clients/requests; avoids open/close overhead.

## Mistakes to avoid saying

- ❌ "Serverless can't have state." Process-local state is fine
  within an instance's lifetime; just don't rely on it across
  instances.
- ❌ "Fluid Compute = AWS Fargate." Different platforms, similar
  spirit.

## Go deeper

- Vercel docs on Fluid Compute and Active CPU pricing.
- "Cold starts" — search any AWS / Vercel engineering blog.
- The original Lambda whitepaper (Werner Vogels, 2014).
