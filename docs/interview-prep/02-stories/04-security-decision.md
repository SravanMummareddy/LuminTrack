# Story 04 — Why we DIDN'T pick NextAuth

## Question this answers

- "Tell me about a technology choice you made."
- "A time you went against the popular option."
- "Talk me through a security design decision."

## Situation

LuminTrack needed authentication. Two roles (Admin, Recruiter),
no OAuth providers, no SSO requirement. The obvious pick was
NextAuth (now Auth.js) — it's the default for "auth in Next.js."

## Task

Decide: NextAuth or hand-rolled? Justify the call. The decision
would shape the rate-limiter, the cookie strategy, password
hashing, and the proxy-level gate.

## Action

1. **Listed real requirements.**
   - Email + password login. No social auth.
   - 7-day sticky session.
   - Two roles. Server-side gate per request.
   - Rate limit on login.
   - "Deactivate user" should lock them out immediately.
2. **Inspected NextAuth.** Mostly designed around OAuth providers.
   The credentials provider works but is widely considered "use
   at your own risk." The session table, JWT strategy options,
   and callback hooks added surface area I didn't need.
3. **Estimated hand-rolled effort.**
   - JWT sign/verify with `jose`: ~30 lines.
   - bcryptjs hash/verify: ~10 lines.
   - Session cookie set/clear: ~25 lines.
   - Proxy gate: ~30 lines.
   - Rate limiter: ~50 lines.
   - Total: ~150 LOC, fully readable in one sitting.
4. **Made the call.** Picked hand-rolled. Wrote everything in
   `src/lib/session.ts`, `auth-token.ts`, `password.ts`,
   `rate-limit.ts`. The proxy in `src/proxy.ts` enforces the
   gate.
5. **Defended security choices explicitly:**
   - Cookie: `HttpOnly`, `SameSite: lax`, `secure` in prod, 7-day
     expiry.
   - Login error message: generic "Invalid email or password" so
     we don't leak which accounts exist.
   - Rate limit: 5 per 15 min per `(email, IP)`.
   - Revocation: `getCurrentUser` re-checks `User.isActive` on
     every render — a deactivated user's JWT keeps verifying but
     they're locked out anyway.
   - JWT lib choice: `jose` over `jsonwebtoken` because it works
     in the Edge runtime (where our proxy lives).

## Result

- The whole auth module is ~150 lines, audit-able in one sitting.
- No dependency on a library that wraps OAuth concerns we don't
  have.
- If we ever add SSO, I'll revisit the call — that's the trigger
  for moving back to Auth.js.

## Variant phrasings

- **"A time you went against the obvious option":** NextAuth is
  the default. I picked against it for a clear reason.
- **"A time you prioritised understanding over convenience":**
  The whole auth module fits in one head. No magic.
- **"A time you wrote your own [thing] instead of using a
  library":** Same story, framed differently.

## Honest caveats

- Hand-rolled auth is a *known footgun.* I'm comfortable here
  because the surface is small and the security choices are
  well-trodden — JWT in HttpOnly cookies, bcrypt with cost 10,
  generic error messages, rate-limit on login. I would NOT
  hand-roll OAuth or SAML or 2FA.
- No 2FA today. Tracked in `ENHANCEMENTS.md` §J3 as a future
  item.
- The rate limiter is process-local; on Vercel Fluid an attacker
  hitting different instances bypasses it partially. For 10
  users this is acceptable; public-facing would need Redis.
