# Story 10 — The concurrent-import race that almost happened

## Question this answers

- "A time you noticed a problem before it shipped."
- "An incident or near-miss you handled."
- "A time you read code carefully and caught something."

## Situation

The iLabor importer's first version did a `findOrCreate` for the
Client, Vendor, and JobPortal rows referenced by each job. The
team was small, so I'd designed it assuming a single admin would
run it at a time — but nothing *enforced* that assumption.

While writing the handover for Phase 8a, I traced what would
happen if two admins clicked "Confirm import" within the same
second. Even though the upserts on Job rows are idempotent (via
`@@unique([portalId, portalRefId])`), the `findOrCreate` for
Client and Vendor names *isn't* — Postgres could allow two
concurrent INSERTs to race past the SELECT-then-INSERT pattern,
producing duplicate Client rows with the same name.

The "duplicate" would then violate the unique-name constraint on
the *second* commit, rolling back that whole import transaction.
The first one would succeed; the second admin would see a
confusing error.

## Task

Either harden against the race or accept it with eyes open.
Don't ship a "well, no one would actually do that" mitigation —
that's how bugs hide.

## Action

1. **Tried to reproduce locally.** Wrote a quick test that
   spawned two import promises with overlapping data. The race
   *did* trigger — about 1 in 20 attempts produced a P2002 unique
   violation.
2. **Considered fixes:**
   - **Pessimistic row locks.** `SELECT ... FOR UPDATE` on the
     org-entities at the start. Blocks but creates a deadlock
     risk if the order isn't strict.
   - **Idempotent upserts everywhere.** Replace `findOrCreate`
     with `upsert` on every org-entity touch. Works but
     scatters the protection.
   - **Postgres advisory transactional lock.** One number-keyed
     lock at the start of the import transaction. Auto-releases
     on commit/rollback. Failing-fast is easy.
3. **Picked the advisory lock.** Wrote
   `pg_try_advisory_xact_lock(817293744)` as the first statement
   inside the transaction. If false, throw "Another import is in
   progress." The integer is arbitrary but stable.
4. **Wrote the error message for humans.** Not a stack trace —
   "Another import is in progress." So the second admin knows
   what to do.
5. **Documented the choice.** Added it to the handbook
   (`docs/handbook/10-imports-and-display-ids.md`) and noted the
   advisory lock as the only explicit concurrency primitive in
   the app.

## Result

- Re-ran the local race test — second concurrent import now
  fails fast with a readable message; no orphan duplicates.
- The advisory lock pattern is now a known tool I can reach for
  again. The handbook captures it.
- I almost shipped without the lock. The save was reading my own
  code carefully during handover.

## Variant phrasings

- **"A time you caught your own bug":** I missed it during
  initial implementation; the handover-writing exercise made me
  trace the failure mode.
- **"A time you preferred a simple fix":** The advisory lock is
  one line. The alternatives were more invasive.
- **"A time you learned about Postgres":** I didn't know about
  advisory locks before this. Looked them up because pessimistic
  row locks felt wrong for the situation.

## Honest caveats

- The race never actually happened in production. I caught it in
  a local test. So it's a near-miss, not an incident.
- The advisory lock number is hard-coded. In a multi-tenant
  system I'd derive it from the tenant ID; for a single-tenant
  internal tool, one number suffices.
- I rely on the auto-release behaviour of `_xact_` — if I ever
  refactored to release the lock manually I'd need to be careful
  with error paths.
