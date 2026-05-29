# 06 — Database transactions and ACID

> **In plain English.** A transaction is a way to tell the database
> "treat these multiple changes as one unit — either all succeed
> or none do." If anything fails halfway through, the database
> rewinds. This is what stops you from creating a "Job" row in the
> database but failing to write its audit log entry — those two
> writes happen together or not at all.

## The technical core

**ACID** = four guarantees a transactional database gives you:

| Letter         | Means                                                              |
|----------------|--------------------------------------------------------------------|
| **A**tomicity | All operations in the transaction commit together, or none do. No half-state. |
| **C**onsistency | The DB moves from one valid state to another valid state. Constraints (unique, FK, CHECK) hold. |
| **I**solation | Concurrent transactions don't see each other's partial work — as if they ran serially. |
| **D**urability | Once committed, the change survives crashes. (fsync to disk, WAL replay on recovery.) |

### Atomicity is what you reach for daily

When you write two related things, wrap them in a transaction:

```ts
await prisma.$transaction(async (tx) => {
  const job = await tx.job.create({ data: {...} });
  await logActivity(tx, { jobId: job.id, action: "JOB_CREATED", ... });
});
```

Now either both rows exist, or neither does. Postgres holds a WAL
record until COMMIT; on failure, it rolls back the entire group.

### Isolation levels

Postgres supports four levels (READ UNCOMMITTED, READ COMMITTED,
REPEATABLE READ, SERIALIZABLE). Default is READ COMMITTED. You
*almost never* need to change this for typical CRUD apps.

When you would:
- Banking-style ledger writes — SERIALIZABLE.
- Inventory decrements with race conditions — REPEATABLE READ or
  explicit row locks (`SELECT ... FOR UPDATE`).

### Two phases in code

`prisma.$transaction` has two shapes:

1. **Sequential array form** — `prisma.$transaction([q1, q2])` —
   simpler; all queries succeed or all fail.
2. **Interactive form** — `prisma.$transaction(async (tx) => { ... })`
   — you can branch, read intermediate values, conditional logic.
   LuminTrack uses this.

## Where it lives in LuminTrack

- **The audit invariant.** Every mutation in
  `src/server/actions/*.ts` wraps its DB write + `logActivity(tx, ...)`
  in `prisma.$transaction`. See
  `src/server/actions/jobs.ts` `createJob` for the canonical
  pattern.
- **Bulk import.** `src/server/actions/ilabor-import.ts` wraps the
  entire import — advisory lock, find-or-create, many upserts,
  audit row — in one transaction.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "The single most important invariant in LuminTrack is that every
> mutation writes an audit row, and the data write + the audit
> write must be atomic. I enforce it with `prisma.$transaction`:
> the action gets a transaction client `tx`, both the
> `tx.job.create()` and the `logActivity(tx, ...)` use it. Either
> both rows commit together, or neither does. It's not just a
> 'remember to call logActivity' convention — TypeScript actually
> requires the transaction client, so you can't call it outside.
> If I ever skip the audit, the timeline silently rots; the
> transaction guarantee makes that impossible by construction."

**Expect:**

- "What's the I in ACID?" → Isolation. Be ready to explain READ
  COMMITTED at a high level.
- "How do nested transactions work in Postgres?" → True nested
  transactions don't exist; Postgres has savepoints. Prisma
  emulates with savepoints internally.
- "What happens if a transaction takes 30 seconds?" → It holds
  locks, blocks other writers, can cause deadlocks. Keep
  transactions short.

## Mistakes to avoid saying

- ❌ "ACID means safe." It means specific guarantees; eventual
  consistency systems (Cassandra, DynamoDB) trade some of these
  deliberately.
- ❌ "All writes need a transaction." Single-statement writes are
  already atomic. Wrap only when you need *multi-statement*
  atomicity.
- ❌ "Transactions are free." They hold locks. Long transactions
  hurt throughput.

## Go deeper

- Designing Data-Intensive Applications, ch. 7 (the canonical
  textbook).
- Postgres docs on [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
- "Two-phase locking" and "MVCC" — the implementation strategies
  behind isolation levels.
