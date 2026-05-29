# 11 — Decimal and money

> **In plain English.** Don't use floats (`number` in JS, `FLOAT` in
> SQL) for money. Floats can't represent simple decimals exactly —
> `0.1 + 0.2 = 0.30000000000000004`. Use a fixed-precision Decimal
> type. Store rates and currency amounts as `DECIMAL(12, 2)` in
> Postgres, and as a Decimal class (not `number`) in your app code.

## The technical core

Floating-point uses binary fractions. `1/10` in binary is a
repeating fraction, like `1/3` in decimal. There's no exact float
for `0.1`. Operations accumulate rounding error.

For money — where being off by a cent matters legally — use:

- **In the database:** `DECIMAL(precision, scale)` /
  `NUMERIC(p, s)`. Precision is total digits; scale is digits to
  the right of the point. `DECIMAL(12, 2)` = up to 10 digits left of
  the point, 2 after.
- **In your app:** a library Decimal type. JS doesn't have one
  natively; Prisma ships its own `Decimal` class.
- **Operations:** add/subtract/multiply/divide on the Decimal
  class, not by coercing to `number`.

### The serialization gotcha

Prisma `Decimal` is a class instance — not serializable across the
RSC (Server → Client) boundary. You'll see "only plain objects can
be passed" errors. Flatten before returning to the client:

```ts
return rows.map(r => ({
  ...r,
  vendorRate: r.vendorRate?.toString() ?? null,
  candidateRate: r.candidateRate?.toString() ?? null,
}));
```

Then format on the client.

### Storing currency as integer cents (alternative)

Some teams store money as integer minor units (`amount_cents`,
`amount_paise`). Avoids any Decimal type entirely. Trade-offs:

- ✅ Fast, exact integer math.
- ❌ Currency-dependent — JPY has no minor unit, BHD has 3 digits.
- ❌ Easy to display wrong if you forget to divide.

LuminTrack uses Decimal because rates are USD-typical and the team
reads them as $X.XX/hr.

## Where it lives in LuminTrack

- `prisma/schema.prisma`:
  - `Job.vendorRate Decimal? @db.Decimal(12, 2)`.
  - `Job.candidateRate Decimal? @db.Decimal(12, 2)`.
  - `Submission.candidateRate Decimal? @db.Decimal(12, 2)`.
  - `Candidate.totalExperienceYears Decimal? @db.Decimal(4, 1)`.
- `src/server/queries/candidates.ts` and friends flatten Decimal
  fields to strings before returning rows that go to Client
  Components.
- `src/lib/format.ts` → `formatRate(value)` — accepts Decimal,
  number, or string; prints `"$25.50/hr"`.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Money in LuminTrack is `DECIMAL(12, 2)` in Postgres and Prisma's
> Decimal class at the application layer. I avoided floats because
> binary float can't represent decimals exactly — `0.1 + 0.2 !==
> 0.3` in JavaScript, which is unacceptable for billing-adjacent
> data. The gotcha is that Prisma Decimal is a class instance, and
> it's not serializable across the React Server Component → Client
> Component boundary. I learned this when the Candidates table
> blew up with 'only plain objects can be passed.' My fix was to
> flatten Decimal fields to strings inside the query function
> before returning, and format them on the client side. If we
> ever had multi-currency rates, I'd reconsider — integer minor
> units handle that more cleanly than Decimal."

**Expect:**

- "Why not just round?" → Rounding compounds; legal/financial
  contexts require exact arithmetic.
- "When would you use integer cents?" → Multi-currency systems
  or very high write volume.

## Mistakes to avoid saying

- ❌ "JavaScript's `number` is fine for money below a threshold."
  No — the error is *deterministic*, not threshold-based.
- ❌ "BigInt solves it." BigInt is integer only; doesn't help
  fractional money unless you commit to integer-minor-units.

## Go deeper

- IEEE 754 floating-point representation.
- Prisma docs: [Working with Decimal](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/decimal).
- The "0.1 + 0.2" classic article (floating-point-gui.de).
