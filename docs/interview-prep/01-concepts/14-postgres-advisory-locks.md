# 14 — Postgres advisory locks

> **In plain English.** Sometimes you need to make sure only one
> process is doing something at a time — like running a bulk
> importer. Database row locks don't help if the two processes
> aren't touching the same row yet. An *advisory lock* is a lock
> identified by a number you make up — Postgres holds it for you,
> any other process trying to get the same number waits or bails.

## The technical core

Postgres exposes "advisory locks": locks the application can take
and release at will, identified by an integer. The DB doesn't
interpret what the number means — it just gives you mutual
exclusion on that number.

Two flavours:

| Function                          | Releases when…                                   |
|-----------------------------------|--------------------------------------------------|
| `pg_advisory_lock(N)`             | Explicitly with `pg_advisory_unlock(N)` or session ends. |
| `pg_advisory_xact_lock(N)`        | Transaction commits or rolls back.               |
| `pg_try_advisory_lock(N)`         | Returns false instead of blocking.               |
| `pg_try_advisory_xact_lock(N)`    | Returns false; releases at transaction end.      |

`xact` versions are usually what you want — no manual cleanup,
exception-safe.

### When to reach for it

- A long-running maintenance job that must not run twice at once.
- Bulk imports / migrations operating on overlapping data without
  obvious row identity.
- Cross-table coordination where row locks would deadlock.

### What it isn't

- It isn't a substitute for proper unique constraints. Two
  imports both passing the lock check can still both succeed if
  upserts are idempotent.
- It isn't distributed across multiple Postgres clusters. You need
  Redis / etcd / Zookeeper for that.

## Where it lives in LuminTrack

- `src/server/actions/ilabor-import.ts` — the very first statement
  inside the import transaction is:

  ```ts
  const lockRows = await tx.$queryRaw<[{ ok: boolean }]>`
    SELECT pg_try_advisory_xact_lock(817293744) AS ok
  `;
  if (!lockRows[0]?.ok) {
    throw new Error("Another import is in progress.");
  }
  ```

  The number is arbitrary but stable — pick once, use forever for
  the same concern. The `_xact_` variant means it auto-releases
  when the transaction ends.

## How to talk about it in an interview

**Sample answer (90 sec):**

> "I needed to serialize the iLabor importer. Two admins could
> theoretically both upload requisitions at the same time. The
> upserts themselves are idempotent thanks to a composite unique
> key, but doing them concurrently could spawn races in the
> find-or-create logic for clients and vendors. A row-level lock
> doesn't help here because the two imports might be working on
> disjoint sets of jobs — Postgres wouldn't naturally block them.
> So I used a Postgres advisory transactional lock: the first
> statement inside the import transaction calls
> `pg_try_advisory_xact_lock(N)` with a stable integer. If it
> returns false, another import is holding the lock and I throw
> 'Another import is in progress.' The `_xact_` variant means
> the lock auto-releases when the transaction commits or rolls
> back — no manual cleanup, no orphaned locks if the request
> crashes. The constant 817293744 is arbitrary; what matters is
> that everyone agrees on it for this concern."

**Expect:**

- "Why a 32-bit integer?" → That's what the Postgres API accepts.
  You can also pass two 32-bit ints. Don't hash strings without
  understanding the collision risk.
- "What if the process crashes mid-transaction?" → The transaction
  rolls back, the lock releases. Clean.
- "How does this compare to Redis SETNX?" → Same idea, different
  failure modes. Postgres advisory locks are scoped to one DB
  cluster; Redis can be the coordinator for a multi-DB system.

## Mistakes to avoid saying

- ❌ "Advisory locks lock rows." They don't — they lock a number.
- ❌ "We use it instead of unique constraints." No — we use it
  *with* unique constraints. They solve different problems.

## Go deeper

- Postgres docs: [Advisory Lock Functions](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).
- Lamport's 1978 paper on distributed mutual exclusion (if you're
  curious about the theory).
