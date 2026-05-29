# 10 — Indexing and query plans

> **In plain English.** A database table is like a phone book sorted
> by last name — fast to find "Smith," slow to find "everyone in
> Brooklyn." An *index* is a secondary phone book sorted by a
> different column. Pick the columns you filter or join on, give
> them indexes. Don't index everything — each index slows down
> writes and takes disk space.

## The technical core

A database index is a separate data structure (usually a B-tree)
that maps column values → row pointers. With an index on
`Submission.candidateId`:

- `WHERE candidateId = ?` becomes O(log N).
- Without it, the database scans every row: O(N).

### Composite indexes

`(jobId, candidateId)` is a single index over two columns. It can
answer:

- `WHERE jobId = ?` (uses leading column).
- `WHERE jobId = ? AND candidateId = ?` (uses both).
- ❌ `WHERE candidateId = ?` alone (can't use this index well — the
  leading column isn't constrained).

Order matters. The leading column is the one you filter on most.

### Index types you'll meet

| Type            | Used for                                                |
|-----------------|---------------------------------------------------------|
| B-tree (default)| Equality + range. Most common.                          |
| Hash            | Equality only. Smaller than B-tree.                     |
| GIN             | Arrays, full-text, JSON containment.                    |
| BRIN            | Very large append-only tables ordered by a column.      |
| Partial         | `WHERE clause` — only indexes matching rows.            |
| Expression      | Index `LOWER(email)` for case-insensitive lookups.      |

### Reading a query plan

`EXPLAIN ANALYZE SELECT ...` shows:

- `Seq Scan` — reads every row. Bad on large tables.
- `Index Scan` — uses an index.
- `Bitmap Index Scan` — uses an index to build a bitmap, then
  fetches rows.
- `Nested Loop` / `Hash Join` / `Merge Join` — join strategies.

Numbers to look at: estimated vs actual rows (big mismatch =
stale stats — run `ANALYZE`), and total time.

### What NOT to do

- Index every column. Each write maintains every index. Inserts
  slow down quadratically as you add them.
- Index a low-cardinality column (boolean) by itself. Index scans
  return too many rows; full scan would be faster.
- Forget to drop unused indexes. They cost disk + write time for
  no benefit.

## Where it lives in LuminTrack

`prisma/schema.prisma` — every model has `@@index` annotations:

- `Submission` indexes: `@@index([candidateId, jobId])`,
  `@@index([status])`, `@@index([jobId])`, `@@index([candidateId])`,
  `@@index([submittedById])`, `@@index([submittedAt])`.
- `Activity`: indexes per FK + `@@index([createdAt])` for
  timeline-by-time queries.
- `Job`: indexes on `status`, `clientId`, `vendorId`, `portalId`,
  `createdAt`.
- Composite unique: `Job.@@unique([portalId, portalRefId])` — also
  acts as an index.

Pattern: every column referenced in a `WHERE` of a list query has
an index. Every FK has one (Postgres doesn't auto-create FK
indexes; Prisma helps but you should be deliberate).

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Indexes in LuminTrack are pragmatic — each list page reads
> roughly 10 rows out of potentially thousands, so the indexes I
> added match the WHERE and ORDER BY clauses of those queries.
> Submission has indexes on `status`, `jobId`, `candidateId`,
> `submittedById`, and `submittedAt` because the list filters by
> all of those. I also have a composite `@@index([candidateId,
> jobId])` for the duplicate-submission check. The audit log
> indexes the entity FKs *plus* `createdAt`, because the timeline
> query is 'where entity = X order by createdAt desc'. I avoid
> over-indexing because each one costs at write time, and
> LuminTrack writes a lot to the Activity table."

**Expect:**

- "How would you diagnose a slow query?" → `EXPLAIN ANALYZE`, check
  Seq Scan vs Index Scan, check estimated vs actual rows, look at
  whether the leading column of a composite index is used.
- "Why composite vs separate indexes?" → A composite covers
  multi-column equality well. Separate indexes can be combined via
  bitmap scans but are less efficient.
- "Indexes on Postgres vs MySQL?" → Both are B-tree by default;
  Postgres has richer types (GIN/BRIN/partial); MySQL clusters
  the primary key (Postgres does not).

## Mistakes to avoid saying

- ❌ "More indexes = faster." False at write time and storage.
- ❌ "Indexes work for any WHERE." Only if the WHERE can use the
  index — leading column rule, no functions on the column unless
  you have an expression index.

## Go deeper

- Use The Index, Luke (the canonical book): https://use-the-index-luke.com/
- Postgres docs: [Indexes](https://www.postgresql.org/docs/current/indexes.html).
- Practice running `EXPLAIN ANALYZE` on LuminTrack queries — it's
  the single best way to internalize this.
