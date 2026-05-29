# 15 — Optimistic vs pessimistic concurrency

> **In plain English.** Two users edit the same record at the same
> time. Whose change wins, and how do you avoid losing the other?
> *Pessimistic* says "I'll lock the row so nobody else can touch
> it until I'm done." *Optimistic* says "I'll just try to save and
> check at commit time whether someone else changed it under me."
> Most modern web apps lean optimistic.

## The technical core

### Pessimistic concurrency control (PCC)

`SELECT ... FOR UPDATE` takes a row lock. Other transactions trying
to update that row wait. Lock releases on commit/rollback.

- ✅ Simple to reason about. Conflicts can't happen.
- ❌ Holds locks for the whole transaction. Bad for throughput.
- ❌ Deadlocks if you lock multiple rows in different orders.
- ❌ Doesn't survive long user think-time well (you can't hold a
  lock open while a user fills out a form for 5 minutes).

### Optimistic concurrency control (OCC)

Add a `version` integer (or a `lastModifiedAt` timestamp). On
update:

```sql
UPDATE job
SET title = ?, version = version + 1
WHERE id = ? AND version = ?  -- the version we read
```

- If `affected_rows = 0`, someone else updated; surface a conflict.
- If `affected_rows = 1`, you won.

- ✅ No locks held. Great throughput.
- ✅ Works across user think-time.
- ❌ The user might see a "save failed, refresh and retry" error.

### Advisory locks (separate)

Different concept — lock by a *name*, not a row. See
[`14-postgres-advisory-locks.md`](./14-postgres-advisory-locks.md).

### Where conflicts actually happen in LuminTrack

The team is <10 people; the *probability* of two recruiters editing
the same job at the same time is tiny. We don't implement explicit
OCC. The last-write-wins behaviour we get from naive `UPDATE` is
acceptable here — if Priya overwrites Alex's edit, the audit log
captures both edits and they can talk.

For the iLabor importer (a write-heavy, longer-running batch), we
*do* use serialization — see advisory locks.

## Where it lives in LuminTrack

- **No row versioning today.** `updatedAt` is set but not checked.
  Last write wins.
- **The iLabor advisory lock** is the one explicit concurrency
  control.
- **DB-level uniqueness** (`@@unique([candidateId, jobId])` was
  removed, but `@@unique([portalId, portalRefId])` remains) catches
  some race conditions for free.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "LuminTrack is a 10-person internal tool, so I deliberately chose
> last-write-wins for ordinary edits. The probability of two
> recruiters racing on the same record is low, and when it does
> happen the audit log captures both changes — the second one
> wins, but the history is recoverable. If this were a customer-
> facing app I'd implement optimistic concurrency with a version
> column: include the version we read in the WHERE clause of the
> UPDATE, and surface a 'someone else changed this, please refresh'
> error if zero rows are affected. The one place I do enforce
> serialization is the iLabor importer — there I use a Postgres
> advisory transactional lock because two concurrent imports
> could touch overlapping clients and vendors in races that
> upserts alone don't catch."

**Expect:**

- "How would you migrate from last-write-wins to OCC?" → Add a
  `version` column; bump it on every update; check it in WHERE.
- "What's a deadlock and how does it differ from a livelock?" →
  Deadlock: two transactions waiting on each other's locks
  forever. Livelock: they keep retrying and yielding without
  progress.

## Mistakes to avoid saying

- ❌ "Pessimistic is always safer." It blocks throughput; safer
  isn't a binary.
- ❌ "Optimistic is faster." Faster under low contention; can be
  thrashy under high contention.

## Go deeper

- Designing Data-Intensive Applications, ch. 7.
- The papers on "Snapshot Isolation" and how Postgres MVCC works.
