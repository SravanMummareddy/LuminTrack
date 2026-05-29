# 19 — The OWASP holy trinity: CSRF, XSS, SQL injection

> **In plain English.** Three classic web vulnerabilities. **XSS** is
> an attacker putting their JavaScript on your page. **SQL
> injection** is an attacker putting SQL into your queries. **CSRF**
> is an attacker tricking a logged-in user into clicking a link
> that performs an action on their behalf. Modern frameworks
> mitigate all three by default — but understanding *why* is the
> difference between safe and "I thought the framework handled it."

## XSS — Cross-Site Scripting

**What.** Attacker-controlled content gets executed as JS in
another user's browser. Cookies stolen, session hijacked.

**The vector.** Concatenating user input into HTML without escaping.
The classic bad pattern is using a raw-HTML insertion API (React's
`dangerouslySetInnerHTML`, jQuery's `.html()`, server-side template
string concatenation) with values you didn't trust.

**The defence.**

- Auto-escape by default. React does — `{userInput}` renders as
  escaped text. Never pass untrusted input through a raw-HTML
  insertion API; if you must render rich content, sanitize with a
  library like DOMPurify first.
- Content-Security-Policy header: `script-src 'self'` — the browser
  refuses inline scripts.
- HTTP-only cookies so a successful XSS can't read the session
  token.

**LuminTrack's posture.** React JSX everywhere; no raw-HTML
insertion APIs in app code. Session cookie is HTTP-only.

## SQL injection

**What.** Attacker input changes the structure of the SQL query.

**The vector.** String concatenation:

```ts
// BAD
db.query(`SELECT * FROM users WHERE email = '${input}'`);
// input = "' OR 1=1; --"  → returns every user
```

**The defence.**

- Parameterised queries / prepared statements. The driver sends
  the SQL and the values separately; values can't be interpreted
  as SQL.

Prisma parameterises everything for you, including `$queryRaw` *if
you use the tagged-template form*:

```ts
prisma.$queryRaw`SELECT * FROM users WHERE email = ${input}`  // SAFE
prisma.$queryRawUnsafe(`...${input}...`)                      // UNSAFE
```

**LuminTrack's posture.** All queries via the Prisma client; the
only `$queryRaw` is the advisory-lock call with a literal integer.

## CSRF — Cross-Site Request Forgery

**What.** A user is logged into your site. Attacker tricks them
into clicking a link or loading an image that fires a request to
your site. The browser sends their cookie. Your server can't
distinguish the malicious request from a real one.

**The vector.** A form on `evil.com` POSTing to `yourbank.com/transfer`
when the user is logged in to the bank.

**The defence.**

- **`SameSite` cookie attribute.** `SameSite: strict` blocks all
  cross-site sends; `lax` blocks them on POSTs but allows
  top-level navigation. **`SameSite: lax` is enough for most
  apps.**
- **CSRF tokens.** A random token rendered in the form and verified
  on submit. Required if you can't rely on SameSite (older
  browsers).
- **Origin / Referer header check.**

**LuminTrack's posture.** `lumintrack_session` cookie is
`SameSite: lax`. Server Actions verify an internal Next.js token on
invocation (so a forged form on evil.com can't fire one).

## Where it lives in LuminTrack

- **XSS:** React JSX everywhere.
- **SQL injection:** Prisma.
- **CSRF:** `SameSite: lax` cookie set in
  `src/lib/session.ts:createSession`; Next.js Server Action
  internal CSRF token.
- **Auth more broadly:** [`16-auth-jwt-and-sessions.md`](./16-auth-jwt-and-sessions.md),
  [`17-bcrypt-and-password-hashing.md`](./17-bcrypt-and-password-hashing.md),
  [`18-rate-limiting.md`](./18-rate-limiting.md).

## How to talk about it in an interview

**Sample answer (90 sec):**

> "LuminTrack inherits good defaults from the stack — React for XSS
> safety, Prisma for SQL-injection safety, Next.js Server Actions
> + SameSite cookies for CSRF — but I can articulate *why* each
> works. React auto-escapes any `{userInput}` into the DOM, so the
> only way to introduce XSS would be a raw-HTML insertion API
> with untrusted content, which I never use. Prisma sends queries
> and values separately to Postgres, so even if user input
> contains SQL syntax, it can't change the query structure. CSRF
> is mitigated by the session cookie being `SameSite: lax` —
> browsers won't send it on cross-site POSTs — and Next Server
> Actions verify an internal token on invocation. The session
> cookie is also `HttpOnly`, so even if XSS did happen, the
> attacker couldn't exfiltrate the JWT. Defence in depth."

**Expect:**

- "What about stored vs reflected XSS?" → Stored: input persists in
  the DB and re-renders to other users. Reflected: input comes
  back in the response immediately. React escapes both.
- "How would you debug a suspected SQL injection?" → Check whether
  any `$queryRawUnsafe` exists; review string-built queries; log
  parameterised vs string-templated query rates.
- "What's clickjacking?" → A different attack — your page iframed
  by an attacker. Mitigation: `X-Frame-Options: DENY` or
  `frame-ancestors` in CSP.

## Mistakes to avoid saying

- ❌ "React prevents all XSS." Only if you don't bypass its escaping
  via raw-HTML APIs.
- ❌ "Prisma is unhackable." Use `$queryRawUnsafe` and you're back
  to manual safety.
- ❌ "We use HTTPS so we're safe from CSRF." HTTPS prevents
  *network eavesdropping*, not CSRF.

## Go deeper

- OWASP Top 10. Read it once a year. Genuinely.
- PortSwigger Web Security Academy — free and excellent.
- Content-Security-Policy reference on MDN.
