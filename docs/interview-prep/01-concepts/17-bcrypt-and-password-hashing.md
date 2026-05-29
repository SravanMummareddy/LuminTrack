# 17 — bcrypt and password hashing

> **In plain English.** Never store the actual password. Store a
> *hash* — a one-way transformation that can verify a password but
> can't reveal it. Use a hashing algorithm designed for passwords
> (bcrypt, argon2, scrypt), not a general-purpose one (SHA-256
> alone is wrong). The right algorithm is deliberately slow so an
> attacker can't grind through billions of guesses if the database
> leaks.

## The technical core

A password hash needs three properties:

1. **One-way.** Can't reverse to the password.
2. **Salted.** A random salt per user prevents the same password
   from producing the same hash, and defeats rainbow tables.
3. **Slow / expensive.** Designed to take ~100ms even on fast
   hardware. Each guess costs the attacker too.

### Algorithms in order of "modern recommendation"

| Algorithm | When to use                                                     |
|-----------|-----------------------------------------------------------------|
| argon2id  | New systems; OWASP top recommendation as of 2024.              |
| bcrypt    | Well-known, battle-tested, fine for most apps.                  |
| scrypt    | Memory-hard alternative; less common in Node ecosystem.         |
| SHA-256   | ❌ Wrong — too fast. Used for general hashing, not passwords.    |
| MD5 / SHA-1 | ❌ Broken. Don't even use for general hashing.                 |

### bcrypt specifics

- Generates its own salt internally.
- Cost factor (work factor) tunable — typical 10-12. Each +1
  doubles the time.
- Output is a single string that *includes* the salt and cost
  factor, so storing it is trivial.

```
$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
^^^  ^^  ^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
alg  cost   salt (22 chars)         hash
```

To verify, bcrypt re-hashes the input with the stored salt + cost
and compares the result.

### bcrypt vs bcryptjs

- `bcrypt` — native C bindings via node-gyp. Faster.
- `bcryptjs` — pure JS. ~3x slower at the same cost factor, but
  runs in any JS runtime (Edge, Lambda, browsers).

LuminTrack uses **bcryptjs** so the password module could
theoretically run in the Edge runtime without rebuilds. Today the
verify path stays in Node Server Actions; the choice keeps doors
open.

## Where it lives in LuminTrack

- `src/lib/password.ts`:
  ```ts
  export function hashPassword(plain: string) {
    return bcrypt.hash(plain, 10);
  }
  export function verifyPassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }
  ```
- `src/server/actions/auth.ts` calls `verifyPassword` in
  `loginAction`.
- `prisma/seed.ts` calls `hashPassword` when creating seed users.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Passwords in LuminTrack are hashed with bcrypt at cost factor
> 10 via the pure-JS `bcryptjs` library. The choice was bcrypt
> over argon2id only because the team is small and bcrypt is
> well-understood — argon2id is the modern OWASP recommendation
> for new systems. Two things people get wrong here: first, don't
> use SHA-256 alone — it's too fast, an attacker can grind a
> billion guesses per second on a GPU. Second, don't store the
> salt separately — bcrypt's output includes the salt and cost
> factor in a single string, so a future cost-factor upgrade is a
> migration not a rewrite. The verify call is constant-time so
> timing attacks don't reveal whether the username existed."

**Expect:**

- "What's a rainbow table?" → Precomputed `password → hash` table
  for common passwords. Salts defeat it because each user's hash
  has a different prefix.
- "How would you rotate to argon2?" → On next login, re-hash and
  store. Existing bcrypt hashes still verify until that user
  logs in.
- "What's pepper?" → A secret added to the hash on top of the
  salt, kept outside the DB. Defends against full DB compromise.
  Optional; LuminTrack doesn't use one.

## Mistakes to avoid saying

- ❌ "We use SHA-256 for passwords." Wrong; it's too fast.
- ❌ "We store the salt in a separate column." Bcrypt embeds it.
- ❌ "Cost factor 10 is fine forever." It's a tuning parameter;
  re-evaluate yearly as hardware improves.

## Go deeper

- OWASP: [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Argon2 paper (Biryukov, Dinu, Khovratovich, 2015).
- Have I Been Pwned's password-hashing analyses.
