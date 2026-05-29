# 18 — Rate limiting

> **In plain English.** Some endpoints — especially login — shouldn't
> be hit a thousand times a second by the same person. Rate
> limiting says "X attempts per Y minutes per user/IP, then start
> rejecting." It's the cheapest single defence against credential-
> stuffing attacks.

## The technical core

### Common algorithms

| Algorithm           | Behaviour                                                        |
|---------------------|------------------------------------------------------------------|
| Fixed window        | Reset counter every N seconds. Simple; bursts at window edges.   |
| Sliding window      | Smooths the edge by weighting the previous window.               |
| Token bucket        | Refill tokens at rate R; each request consumes one. Allows bursts.|
| Leaky bucket        | Process at constant rate; reject if queue full.                  |

LuminTrack uses **fixed window** keyed by `(email, IP)` — the
simplest, sufficient for a 10-user internal app.

### Storage layers

- **In-process Map.** Cheap. Doesn't survive deploys. Doesn't
  share across serverless instances. Adequate for low-stakes use.
- **Redis.** Shared across instances, persistent, supports atomic
  increment via Lua scripts. Standard production choice.
- **Database row.** Possible but slow.
- **Provider tier** (Cloudflare, Vercel WAF). Outside your app
  entirely.

### Where to apply it

- Login (always).
- Password reset, signup, "forgot password" emails.
- Any expensive query a user can trigger.
- Public APIs.

### Key choice

- IP alone — punishes shared offices behind NAT.
- Username alone — punishes the victim of credential stuffing.
- `(username, IP)` — best of both for login.

## Where it lives in LuminTrack

- `src/lib/rate-limit.ts` — process-local Map with TTL buckets,
  capped at 5000 entries (drop-oldest).
  ```ts
  export function rateLimit(key, limit, windowMs): { ok: true } | { ok: false; retryAfterMs };
  ```
- `src/server/actions/auth.ts` — `loginAction` limits to 5 per 15
  minutes per `(email, IP)`. Successful login resets the counter
  via `resetRateLimit(key)`.
- IP extracted from `x-forwarded-for` (Vercel sets it) or
  `x-real-ip`.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Login in LuminTrack is rate-limited to 5 attempts per 15
> minutes, keyed by `(email, IP)`. The implementation is a tiny
> in-process Map — sufficient for an internal 10-user app. I
> deliberately chose `(email, IP)` rather than IP alone or email
> alone: IP-only punishes a shared office NAT; email-only
> punishes the victim of a credential-stuffing attack. The
> bucket cap is 5000 entries with drop-oldest eviction so a flood
> of unique keys can't OOM the process. The big trade-off is that
> the counter doesn't share across serverless instances — on
> Vercel Fluid Compute, an attacker hitting different instances
> bypasses it partially. For a public-facing app I'd swap to
> Upstash Redis for shared state."

**Expect:**

- "Why fixed window not token bucket?" → Simpler; token bucket's
  burst tolerance isn't needed for login.
- "What error should the user see?" → "Too many attempts. Try
  again in N minutes." Don't reveal which check failed.
- "How would you test it?" → Unit test the helper with a fake
  clock; integration test that the 6th attempt within 15 min
  rejects.

## Mistakes to avoid saying

- ❌ "Cloudflare handles it for me." It can, but you should still
  have app-level limits as defence-in-depth.
- ❌ "I rate-limit on every endpoint." Don't — read endpoints under
  normal load don't need it, and over-limiting hurts UX.

## Go deeper

- Cloudflare blog: "How we built rate limiting."
- Stripe's old "Scaling your API with rate limiters" — gold
  standard write-up.
- Upstash docs on Redis rate-limit patterns.
