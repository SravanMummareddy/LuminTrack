# 05 — Auth and sessions

> **In plain English.** How "log in" works. A user types email +
> password, we check the hashed password in the database, sign a
> tiny token, drop it in an HTTP-only cookie, and from then on every
> request the proxy checks that token. There is no NextAuth, no
> third-party identity provider.

## The pieces

| File                            | Role                                                                |
|---------------------------------|---------------------------------------------------------------------|
| `src/lib/auth-token.ts`         | Sign/verify the JWT. Uses `jose`. Cookie name + max-age constants.  |
| `src/lib/password.ts`           | bcrypt hash + verify. `bcryptjs` (pure JS, edge-safe).              |
| `src/lib/session.ts`            | `getCurrentUser`, `requireUser`, `createSession`, `destroySession`. |
| `src/lib/rate-limit.ts`         | In-memory sliding-window limiter. Logins get 5/15 min/email+IP.     |
| `src/server/actions/auth.ts`    | `loginAction`, `logoutAction`. The two endpoints users hit.         |
| `src/proxy.ts`                  | Per-request auth gate. Redirects unauthenticated traffic to /login. |
| `src/app/(auth)/login/page.tsx` | The login form.                                                     |

## The cookie

- Name: `lumintrack_session`.
- Contents: JWT signed HS256 with `AUTH_SECRET`. The user ID is the
  `sub` claim. No other fields — we keep tokens narrow.
- Flags: `httpOnly`, `secure` in prod, `sameSite: lax`, `path: /`,
  `maxAge: 7 days`.
- Lives only in the cookie jar. No server-side session table.

Why JWT and not a `Session` table?
- Two roles, ten users, one cookie per user. A session table adds a
  DB hit on every page load for no real benefit at this scale.
- Revocation can be done by flipping `User.isActive = false` — the
  `getCurrentUser()` lookup checks that flag and refuses inactive
  users even if their JWT is still valid.

## Login flow

```
[User] enters email+pass on /login
   │
   ▼
[Client form] action={loginAction}
   │
   ▼  Server Action
[loginAction]
  1. Zod schema parse              -> bail to "Enter your email..."
  2. rateLimit("login:email:ip")   -> bail to "Too many attempts..."
  3. prisma.user.findUnique(email)
  4. verifyPassword(plain, hash)   -> bcrypt compare
  5. resetRateLimit (clear counter)
  6. createSession(user.id)        -> signs JWT, sets cookie
  7. redirect("/")
```

Three layered checks (rate limit, user existence + active flag,
password verify) all return the *same* generic message:
"Invalid email or password." We never leak which accounts exist.

## Logout

`logoutAction` is bound to a `<form action={logoutAction}>` in the
UserMenu dropdown. It:

1. `getCurrentUser()` — bounce to /login if already unauthenticated
   (so a forged unauth POST can't burn cookies endlessly).
2. `destroySession()` — `cookies().delete(SESSION_COOKIE)`.
3. `redirect("/login")`.

## The per-request gate (proxy.ts)

`src/proxy.ts` (Next 16's renamed middleware) runs on every request
except API routes, Next internals, and static files:

```
matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"]
```

Logic:

1. Asset routes (`/icon`, `/apple-icon`) bypass auth so the browser
   can fetch favicons.
2. Read `lumintrack_session` cookie.
3. `verifySessionToken()` returns the user id or `null`.
4. If `null` and the path is not in `PUBLIC_PATHS = ["/login"]`,
   redirect to `/login`.
5. If signed-in and the path *is* `/login`, redirect to `/`.

Note the proxy does **not** look up the User row — that would be a
DB call on every request. The full user fetch happens inside the
React `cache(getCurrentUser)` per render, exactly once.

## `getCurrentUser` and the React `cache()`

```ts
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  return user;
});
```

`cache()` is the React 19 helper that memoises a function within a
single request. The page Server Component, the topbar, and any
deeper component can all call `getCurrentUser()` and only one DB
lookup happens.

`requireUser()` wraps it and `redirect("/login")` if null.

## Role gating

There's no fancy role system. Server Actions and pages check the
role inline:

```ts
const user = await requireUser();
if (user.role !== "ADMIN") {
  // either throw a Forbidden, redirect, or just refuse to render
}
```

Examples:
- `/audit` page returns a `<Forbidden />` for non-admins (see
  `src/components/ui/forbidden.tsx`).
- Org-entity writes in `src/server/actions/org.ts` check role and
  refuse if not admin.
- The "My work" Dashboard scope defaults to `me` for recruiters and
  `org` for admins.

## Password hashing

`src/lib/password.ts` wraps bcryptjs:
- `hashPassword(plain)` — cost factor 10.
- `verifyPassword(plain, hash)` — constant-time compare.

We picked `bcryptjs` (pure JS) over `bcrypt` (native binding) so
the code runs in Edge runtimes if we ever need to (proxy.ts is
edge-friendly today; the password-verify path stays in Node Server
Actions).

## Rate limiting

`rateLimit(key, limit, windowMs)` keeps a `Map<string, { count,
resetAt }>` in memory. Login is 5 attempts per 15 minutes, keyed by
`login:<email>:<ip>`. Process-local; doesn't share across serverless
instances. Adequate friction for an internal 10-user tool — if we
ever go public, swap for Upstash Redis.

The IP comes from `x-forwarded-for` (Vercel adds it). The bucket
table is capped at 5000 entries (drop-oldest if it overflows) so a
flood of unique keys can't OOM the process.

## Seed admin

`prisma/seed.ts` reads `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`
from `.env` and creates a single ADMIN user on first run. The demo
seed (`prisma/seed-demo.ts`) creates `admin@lumintrack.com` /
`LuminTrack2026!` plus 7 sample recruiters who share that password.
These are not real credentials — never deploy with them set.

## Security posture summary

| Threat                          | Mitigation                                                |
|---------------------------------|-----------------------------------------------------------|
| Credential stuffing             | Rate limiter (5/15 min per email+IP).                     |
| Account enumeration             | Identical error message for all three failure modes.      |
| Stolen cookie                   | `httpOnly` (no JS read), `secure` in prod, 7-day expiry.  |
| Stolen JWT after deactivation   | `getCurrentUser` re-checks `User.isActive` on each render.|
| CSRF                            | Server Actions verify their internal token (Next built-in) + `sameSite: lax` cookie. |
| SQL injection                   | Prisma parameterises every value.                         |
| XSS                             | React escapes JSX by default. No raw-HTML insertion APIs are used anywhere in app code. |

What we *don't* have (yet):
- No 2FA. Tracked in `ENHANCEMENTS.md` §J3.
- No SSO. Out of scope for the team size.
- No password-reset flow. Admins reset via the seed/users tooling
  directly — a self-serve flow can be added later.
