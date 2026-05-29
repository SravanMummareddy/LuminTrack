# 13 — Composite keys and upserts

> **In plain English.** Sometimes a row's identity isn't one column,
> it's two together — like "the iLabor job with portal ID X and
> ref ID Y." A composite unique key says "this combination must be
> unique." An *upsert* says "insert if it doesn't exist; update if
> it does" — and it uses the unique key to decide.

## The technical core

### Composite unique constraint

```prisma
model Job {
  portalId    String?
  portalRefId String?
  @@unique([portalId, portalRefId])
}
```

In SQL:

```sql
CREATE UNIQUE INDEX ON job (portal_id, portal_ref_id);
```

The pair must be unique. Either column alone can repeat.

### Composite primary key vs unique constraint

Both enforce uniqueness. A primary key is also the row's identity
(referenced by FKs). LuminTrack uses cuids as primary keys and adds
*additional* composite unique constraints when the natural identity
involves multiple columns (e.g. `(portalId, portalRefId)`).

### Upsert

```ts
prisma.job.upsert({
  where: { portalId_portalRefId: { portalId, portalRefId } },
  create: { /* new row */ },
  update: { /* changes */ },
});
```

Under the hood:

- Postgres: `INSERT ... ON CONFLICT (portal_id, portal_ref_id) DO
  UPDATE SET ...`.
- The `ON CONFLICT` target *must* match a unique constraint.

### Idempotency

An upsert with a stable key is *idempotent*: running the import
twice produces the same final state. Critical for retries.

## Where it lives in LuminTrack

- `prisma/schema.prisma` → `Job @@unique([portalId, portalRefId])`.
- `src/server/actions/ilabor-import.ts` upserts every imported job
  using that key. Re-running the import updates existing rows,
  creates new ones, never duplicates.
- `JobAssignment @@unique([jobId, recruiterId])` — a recruiter is
  either assigned or not; can't assign twice.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "The iLabor importer demanded idempotency — admins re-run the
> import to refresh status, and that must not duplicate jobs.
> The natural identity of an imported job is the pair
> `(portalId, portalRefId)` — that's iLabor's own requisition
> identifier, scoped to the portal. I added a Prisma
> `@@unique([portalId, portalRefId])`, which becomes a Postgres
> composite unique index, and the import logic uses `prisma.job.upsert`
> with that key. Re-running just updates the existing row. The
> assignment join table uses the same pattern — `@@unique([jobId,
> recruiterId])` — so you can't accidentally double-assign someone."

**Expect:**

- "What if portalRefId is null?" → Postgres treats nulls as
  distinct, so the constraint allows multiple null pairs. In our
  case, manually-created jobs have both null and that's fine —
  manual jobs are identified by their cuid.
- "Race condition between two concurrent imports?" → That's why
  we *also* take a `pg_advisory_xact_lock` before the upsert
  loop. See [`14-postgres-advisory-locks.md`](./14-postgres-advisory-locks.md).
- "What's the difference between INSERT IGNORE and ON CONFLICT?" →
  ON CONFLICT is Postgres-native, lets you specify what to update.
  INSERT IGNORE (MySQL) silently swallows conflicts.

## Mistakes to avoid saying

- ❌ "Composite keys are an anti-pattern." They're a tool. Use them
  when natural identity is composite.
- ❌ "Upsert is one operation." Logically yes; physically it's
  insert+check / update. Race conditions exist around the check.

## Go deeper

- Postgres docs: [INSERT ... ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).
- Prisma docs: [upsert](https://www.prisma.io/docs/orm/reference/prisma-client-reference#upsert).
