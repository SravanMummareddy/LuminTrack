/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * Scope: process-local. State does NOT survive a deploy and is NOT shared
 * across serverless instances (so on Vercel Fluid Compute an attacker who
 * hits different instances bypasses it partially). Adequate friction for
 * an internal <10-user tool; upgrade to Upstash if exposing to the public.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 5000; // hard cap so a flood of unique keys can't OOM us

/**
 * Returns `{ ok: true }` if the caller is under the limit (and increments
 * the counter), or `{ ok: false, retryAfterMs }` if blocked.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    // First hit, or the previous window has expired — start fresh.
    if (buckets.size >= MAX_BUCKETS) {
      // Drop the oldest entry. Map preserves insertion order, so the first
      // key returned by keys() is the oldest.
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { ok: true };
}

/** Resets a key — call on successful login so a clean attempt clears prior fails. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
