# Q 03 — Backend and database

Twelve common backend / DB questions. For each: outline +
LuminTrack example + watch-out.

---

### Q1. "Explain ACID."

**Outline.**
- Atomicity, Consistency, Isolation, Durability.
- Atomicity is what you reach for daily — multi-statement
  rollback safety.

**Example.** Every mutation in LuminTrack wraps `tx.x.create()` +
`logActivity(tx, ...)` in one `prisma.$transaction` for
atomicity. Concept 06.

---

### Q2. "What's an index, and when do you add one?"

**Outline.**
- B-tree over a column maps values → row pointers.
- Add for columns used in WHERE / JOIN / ORDER BY of frequent
  queries.
- Cost: write time + storage.

**Example.** Submission indexes on `status`, `jobId`,
`candidateId`, `submittedAt`. Audit has `@@index([createdAt])`
for timeline queries. Concept 10.

---

### Q3. "What's a composite key?"

**Outline.**
- Unique constraint over multiple columns. Either column may
  repeat alone; the combination must be unique.

**Example.** `Job @@unique([portalId, portalRefId])` — for the
iLabor upsert. Concept 13.

---

### Q4. "What's an upsert?"

**Outline.**
- Insert if not exists, update if exists.
- Implemented in Postgres as `INSERT ... ON CONFLICT (key) DO
  UPDATE SET ...`. The ON CONFLICT target must match a unique
  constraint.

**Example.** iLabor importer upserts on
`(portalId, portalRefId)`. Concept 13.

---

### Q5. "How do you prevent two concurrent jobs from racing?"

**Outline.**
- Row locks (`SELECT FOR UPDATE`) for shared rows.
- Postgres advisory transactional lock for coordination by
  name/number.
- Distributed: Redis SETNX / Zookeeper.

**Example.** `pg_try_advisory_xact_lock(817293744)` at the start
of the import transaction. Concept 14, story 10.

---

### Q6. "What's the difference between a stored procedure and a
trigger?"

**Outline.**
- Procedure: a callable function defined in the DB.
- Trigger: fires automatically on INSERT/UPDATE/DELETE.

**Example.** LuminTrack uses neither. I considered triggers for
the audit log (would enforce at the DB layer) but kept it in
app code so transactional context (acting user) is available.

---

### Q7. "Polymorphic relations — how would you model 'a comment on
any entity'?"

**Outline.**
- Three designs: nullable-FK-per-parent + discriminator; single
  string FK; sub-tables.
- Trade-offs around FK constraints, cascade, query simplicity.

**Example.** LuminTrack's `Note` and `Activity` use the
nullable-FK-per-parent design. Concept 08.

---

### Q8. "How do you store money?"

**Outline.**
- DECIMAL(p, s), not FLOAT.
- Optionally integer minor units.
- Watch serialization across language boundaries (Prisma
  Decimal isn't RSC-serializable).

**Example.** `Decimal(12, 2)` for rates. Flattened to strings in
queries before returning to Client Components. Concept 11.

---

### Q9. "How do you store time?"

**Outline.**
- UTC `timestamptz` in DB.
- IANA timezone name stored separately when intent matters.

**Example.** Interview rounds have `scheduledAt` (UTC) +
`scheduledTimezone` (IANA). Concept 12.

---

### Q10. "What's an N+1 query, and how do you fix it?"

**Outline.**
- Pattern: load parent, then loop and load each child.
- Fix: include relations in the parent query (single JOIN), or
  use a `dataloader`.

**Example.** Prisma `include` for relations in `listJobs`
(includes `client`, `vendor`, `assignments`, `_count`). One
query, not N+1.

---

### Q11. "How do you handle migrations safely?"

**Outline.**
- Additive first (nullable column, no constraints).
- Backfill in a second migration.
- Constraint addition in a third migration.
- Never edit old migrations.

**Example.** Dropping the unique constraint on Submissions was
two-phase: (1) add `duplicateReason` column and move check to
app, (2) drop the unique index. Story 05.

---

### Q12. "How would you scale the audit log?"

**Outline.**
- Partition by month (Postgres declarative partitioning).
- Older partitions on cheaper storage.
- Query patterns walk current + previous partition.

**Example.** Today it's one table. At 100× scale I'd partition.
SD 03.
