# 21 — TypeScript type safety

> **In plain English.** TypeScript is JavaScript with a type
> checker. At compile time it catches "you passed a string where
> a number was expected." At runtime it does nothing — it's
> stripped away. The trick is to make types flow from the database
> all the way to the JSX so refactors stay safe.

## The technical core

### The "type flow" goal

```
Prisma schema → generated client types → query return types →
  → Server Component props → Client Component props → JSX
```

If the Job schema gains a column, TypeScript flags every consumer.
Refactors stop being "find and replace" gambles.

### Key features used in LuminTrack

- **`type` vs `interface`.** Mostly interchangeable. We use `type`
  for unions and small structures; `interface` rarely.
- **Generics.** `Paginated<T>` in `src/lib/filters.ts` returns
  `{ rows: T[]; total: number; page: number }`.
- **Discriminated unions.** Our `FormState` is essentially
  `{ ok?: true } | { error: string; fieldErrors?: Record<…> }`.
  The discriminator lets us narrow.
- **`as const`.** `JOB_STATUS_VALUES = [...] as const` produces a
  tuple of literal strings, which `z.enum(...)` can consume.
- **`Awaited<ReturnType<typeof fn>>`.** Used in
  `src/server/queries/timeline.ts` to derive the row type from
  the query function:
  ```ts
  type TimelineEntry = Awaited<ReturnType<typeof getTimelineFor>>[number];
  ```
  This means you never have to write a parallel `TimelineEntry`
  interface that drifts from the query.
- **`satisfies`** (TS 4.9+). Lets you assert a value matches a type
  without losing literal narrowing. We don't use it heavily but
  it's worth knowing.
- **Branded types.** A pattern where `type UserId = string & { __brand: "UserId" }`
  prevents passing a JobId where a UserId was expected. Overkill
  for LuminTrack; useful in large codebases.

### What TS does NOT do

- **No runtime checks.** A `string` typed value can be anything at
  runtime — that's why Zod exists for boundary validation
  (see [`20-zod-and-validation.md`](./20-zod-and-validation.md)).
- **Bypasses.** `as any`, `// @ts-ignore`, and `unknown` casts
  silence the checker. Use sparingly; comment why.

### `strict` mode

`tsconfig.json`'s `strict: true` turns on a family of checks:
`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, etc.
LuminTrack has it on. Don't turn it off.

## Where it lives in LuminTrack

- `tsconfig.json` — `strict: true`.
- `src/lib/filters.ts` — generic `Paginated<T>`, discriminated
  `SortState`.
- `src/lib/form-state.ts` — `FormState` shape.
- `src/server/queries/timeline.ts` — `Awaited<ReturnType<…>>`
  trick to derive types from queries.
- `src/lib/labels.ts` — `Record<JobStatus, BadgeTone>` so enums and
  presentation stay in lock-step.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "TypeScript's job in LuminTrack is to make types flow from
> Prisma all the way to JSX without me writing parallel
> interfaces. Prisma generates client types from the schema; the
> query functions in `src/server/queries/` return those types; the
> Server Component receives them; the Client Component prop type
> is inferred from the Server Component's render. If I add a
> column, the compiler flags every consumer. A pattern I use a
> lot is `Awaited<ReturnType<typeof query>>[number]` to derive
> a row type from the query function — saves a separate
> declaration that would otherwise drift. I keep `strict` on
> everywhere; the cost of `noImplicitAny` is small, the benefit
> is catching whole classes of refactor bugs."

**Expect:**

- "When do you use `any`?" → Rarely. When integrating with
  untyped libraries; immediately narrow on the next line.
- "What's the difference between `unknown` and `any`?" → `any`
  opts out of checking; `unknown` requires narrowing before use.
  `unknown` is safer.
- "How do you handle TS performance?" → Avoid deep conditional
  types and recursive generics in hot paths.

## Mistakes to avoid saying

- ❌ "TypeScript catches all bugs." Compile-time only. Runtime
  bugs (data, IO, race conditions) still exist.
- ❌ "Strict mode is too strict." It's the modern baseline.
- ❌ "I cast with `as` to make errors go away." That's a code
  smell; usually the type is wrong somewhere upstream.

## Go deeper

- Matt Pocock's content (totaltypescript.com / YouTube).
- TypeScript handbook — read the "Everyday Types" and "Narrowing"
  sections in full.
- Effective TypeScript by Dan Vanderkam (book).
