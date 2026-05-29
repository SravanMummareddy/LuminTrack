# 16 — Auth: JWT vs sessions

> **In plain English.** When a user logs in, you need to remember
> them on the next page. Two main strategies: (1) generate a
> random ID, store it in a database table, send the ID to the
> browser as a cookie; or (2) put the user's ID into a signed
> token (JWT), send *that* to the browser. LuminTrack uses option
> 2 because we don't need server-side session storage.

## The technical core

### Sessions (server-stateful)

```
[Login] → DB INSERT into sessions(id, user_id, expires_at)
       → send back set-cookie: session_id=<random>
[Each request] → look up sessions WHERE id = ? AND expires_at > now()
              → fetch the user
```

- ✅ Revoke any session by deleting the row.
- ✅ Server controls expiry, refresh, sliding window.
- ❌ Every request hits the DB just to identify the user.
- ❌ Sessions table grows; need eviction.

### JWT (server-stateless)

```
[Login] → sign a JWT { sub: userId, exp: ... } with HMAC secret
       → send back set-cookie: token=<jwt>
[Each request] → verify signature, parse payload
              → fetch the user
```

- ✅ No DB hit just to parse the token.
- ✅ Easy to move across services (carry the JWT).
- ❌ Can't revoke a JWT before its expiry without a blocklist
  (which reintroduces server state).
- ❌ Stolen JWT is valid until expiry.

### The middle ground

JWT for identification, plus check the User row's `isActive` on
every request. That's what LuminTrack does. Revoking a user is one
flag flip; their JWT becomes useless even though it's still
mathematically valid.

### Where to store the token in the browser

- **HTTP-only cookie** (recommended): JavaScript can't read it.
  Mitigates XSS-driven token theft.
- **localStorage** (bad): any XSS reads it.
- **In-memory** (better than localStorage, worse than HTTP-only):
  lost on refresh.

LuminTrack uses HTTP-only cookies with `SameSite: lax`, `secure` in
prod.

## Where it lives in LuminTrack

- `src/lib/auth-token.ts` — `signSessionToken` + `verifySessionToken`
  using `jose` (works in Edge runtime).
- `src/lib/session.ts` — `createSession`, `destroySession`,
  `getCurrentUser` (wrapped in React `cache()` per request).
- `src/proxy.ts` (Next 16 middleware renamed to "proxy") — the
  per-request gate that verifies the cookie and redirects to
  `/login` if invalid.
- `src/server/actions/auth.ts` — `loginAction` / `logoutAction`.

## How to talk about it in an interview

**Sample answer (90 sec):**

> "I picked JWT-in-a-cookie over a database-backed session table
> for LuminTrack. The team is 10 users — a session table would
> add a DB hit on every page load for zero benefit. The JWT is
> signed HS256 with an `AUTH_SECRET`, contains only the user's
> ID in the `sub` claim, expires after 7 days, and lives in an
> HTTP-only `lumintrack_session` cookie with `SameSite: lax`. The
> revocation problem you'd normally have with JWT — once it's
> signed, you can't take it back — I solve with a single check:
> every request loads the User row and refuses inactive users.
> So if I deactivate someone, their JWT keeps verifying but
> `getCurrentUser` returns null and they're locked out on the
> next request. I considered NextAuth and rejected it as
> overkill for two roles and no OAuth providers — the whole auth
> module is about 80 lines."

**Expect:**

- "What if the user wants to log out everywhere?" → Today, can't —
  the JWT is in their cookie only. To make it global I'd add a
  `sessionVersion` column and bake it into the JWT; bumping the
  column invalidates outstanding tokens.
- "Why HS256 and not RS256?" → HS256 (symmetric HMAC) is fine for
  one server signing and verifying. RS256 (asymmetric) is for
  multi-service systems where one service signs and others
  verify with a public key.
- "How do you mitigate CSRF?" → `SameSite: lax` cookie, plus Next
  Server Actions verify an internal token.

## Mistakes to avoid saying

- ❌ "JWT is more secure than sessions." Not by default. Different
  trade-offs.
- ❌ "Stored in localStorage." That's the XSS-bait option.
- ❌ "JWT can be revoked." Not without server state — the whole
  point is that they're stateless.

## Go deeper

- jwt.io — paste a token and inspect it.
- OWASP cheat sheet: [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- Auth0 / Clerk blog posts on "JWT vs sessions" — most are fair.
