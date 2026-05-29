# SD 03 — "What if it had to handle 100×?"

> Use this when an interviewer asks "how would you scale this?"
> or "what breaks at 10,000 recruiters?" The honest answer is
> "many things, in a specific order." Avoid hand-waving "I'd add
> Redis."

## The baseline (today)

- ~10 recruiters.
- ~hundreds of jobs at a time.
- ~thousands of submissions over months.
- ~thousands to tens-of-thousands of audit rows over months.

## What 100× looks like

- ~1000 recruiters.
- ~tens of thousands of active jobs.
- ~hundreds of thousands of submissions.
- ~millions of audit rows over time.

## What breaks first (in rough order)

### 1. The audit log gets huge

`Activity` is the highest-write table. At 100× scale, hundreds
of writes per minute. Timeline queries scan more rows.

**Fix:** partition `Activity` by month
(`activity_2026_01`, `activity_2026_02`, …). Postgres declarative
partitioning is built-in. Old partitions stay queryable, can
move to cheaper storage. The `getTimelineFor` query becomes
"latest N rows from current + previous partition" — still fast.

### 2. Offset pagination slows down

`OFFSET 50000` on the audit page scans 50k rows before returning
25. Even with indexes, this stings at scale.

**Fix:** keyset pagination on `(createdAt, id)`. UI changes from
"page 5 of N" to "next / previous" plus a date-range jump.
Concept 23.

### 3. The Reports queries get slow

Currently the time-in-stage report walks audit rows in
TypeScript with a `median()` helper. At 100× that's a lot of
data shipped to the application.

**Fix:** rewrite the aggregations as Postgres CTEs / window
functions. Or materialise nightly into a `report_snapshots`
table and query that. Or push reports onto a read replica.

### 4. Rate limiter becomes useless

Today it's in-memory. At 100× recruiters spread across more
Fluid Compute instances, a brute-force attacker hitting
different instances bypasses it.

**Fix:** swap to Upstash Redis with the same `rateLimit()`
contract. The interface stays; the storage moves.

### 5. The Prisma client gets thicker

Generated client size grows with the schema. Build times rise.
Cold start (rare on Fluid) gets a bit slower.

**Fix:** split into multiple Prisma schemas (preview / classic /
reports) or move heavy reporting to raw SQL queries that don't
need the typed client.

### 6. Long-running tasks fight the request lifecycle

Today there are no async jobs. At 100×, you'd want: weekly
recruiter performance digest, candidate-engagement nudges,
iLabor poll on a schedule, deactivated-user GDPR sweep.

**Fix:** Vercel Queues (beta as of 2026) or a separate worker
on a regular VM. Server Actions can enqueue; a worker drains.

### 7. Search becomes ~slow~

Substring search across thousands of jobs/candidates with
`contains` is fine. At 100k+ rows it's an index scan but the
return set might be large.

**Fix:** Postgres full-text search (`tsvector`/`tsquery`) for
ranked relevance, GIN index. Beyond that: Algolia / Meili /
OpenSearch.

### 8. Connection pool exhaustion

At burst times, many Fluid instances each holding connections
could push past Postgres' cap.

**Fix:** Neon's pooled URL is already in use; widen the pool
limit. If still tight, PgBouncer in transaction mode.

## What does NOT need to change

- The schema shape. The core tables scale fine.
- The audit invariant. Transactions hold up.
- Server Component model. RSC is fine at any scale.
- The polymorphic Note/Activity design. The discriminator +
  per-FK index pattern indexes well.

## The interview move

After listing what breaks, *prioritise*:

> "I'd start with audit partitioning — it's the highest-write
> table and easiest to win on. Then keyset pagination on the
> audit page. Then Redis for the rate limiter. After that the
> Reports queries get reviewed — partition or replicate.
> Everything else can wait until I've measured."

That's measured, ordered thinking. Don't recite the whole list
as a wishlist.

## Watch out for

- "I'd microservice it." Don't. The right move is to harden the
  monolith. Splitting is the *last* resort.
- "I'd switch to NoSQL." LuminTrack is relational at heart;
  going NoSQL throws away the audit invariant and forces
  reinventing transactions.
- "I'd cache aggressively." Cache invalidation gets harder than
  the original problem. Reach for caching *after* indexes and
  query rewrites.
