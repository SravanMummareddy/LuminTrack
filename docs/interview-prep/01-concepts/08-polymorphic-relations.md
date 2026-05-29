# 08 — Polymorphic relations

> **In plain English.** A polymorphic relation means "this row
> belongs to *one of* several different tables." A note can be on a
> job, a candidate, a submission, or an interview round — pick one.
> There are several ways to model this in a relational database
> and each has trade-offs.

## The technical core

Three common designs:

### A. Nullable FK per parent + a discriminator

```sql
note (
  id, body, created_at,
  entity_type ENUM('JOB', 'CANDIDATE', ...),
  job_id NULL FK job(id),
  candidate_id NULL FK candidate(id),
  submission_id NULL FK submission(id),
  interview_round_id NULL FK interview_round(id),
  -- CHECK constraint: exactly one is non-null and matches entity_type
)
```

✅ Real FK constraints. ON DELETE CASCADE works. Indexable.
❌ Wider table. "Exactly-one" check is messy SQL.

### B. Single string FK + entity_type (no real FK)

```sql
note (
  id, body, entity_type, entity_id  -- entity_id is a string
)
```

✅ Slimmest. ✅ Generic — add new entity types without migrations.
❌ No FK constraint. ❌ Cascading deletes need triggers.
❌ Cross-table joins are awkward.

### C. Sub-tables per type

```sql
note_for_job (note_id, job_id)
note_for_candidate (note_id, candidate_id)
...
```

✅ Each link is a real FK.
❌ Querying "all notes for entity X" requires a UNION.

### LuminTrack picked A

Because we want true FK constraints, cascade-delete behaviour, and
the entity types are bounded (4 in total, not a sprawling generic
graph).

## Where it lives in LuminTrack

- `prisma/schema.prisma` → `model Note` and `model Activity`.
  Both have:
  - 4 nullable FK columns.
  - `entityType` enum discriminator.
  - One index per FK column for fast lookup.
  - `onDelete: Cascade` so children disappear with their parent.
- The "exactly one is set" rule is enforced in code, not in the DB.
  See `src/server/activity.ts` — `logActivity` takes `jobId? |
  candidateId? | submissionId? | interviewRoundId?` and only the
  matching one gets set.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Notes and audit rows in LuminTrack are polymorphic — a note
> belongs to a Job, a Candidate, a Submission, or an Interview
> Round. I evaluated three designs: one nullable FK per parent
> with a discriminator, a single generic entity_id string with no
> FK, or sub-tables per type. I picked the nullable-FK-per-parent
> design because the entity types are bounded — only four — and I
> wanted real foreign keys for cascade behaviour and DB-level
> integrity. The trade-off is a wider table and the lack of a
> DB-level 'exactly one is set' constraint, which I enforce in
> the app layer via the `logActivity` helper signature."

**Expect:**

- "Why not just one entity_id string?" → No FK constraint, no
  cascade, bad data integrity for a tool that's all about audit.
- "How do you add a 5th entity type?" → New nullable FK column, new
  enum value, new index, new arg to the helper. One migration.
- "Could you enforce 'exactly one' in the DB?" → Yes, with a CHECK
  constraint counting non-null columns. We haven't because the app
  layer is the only writer.

## Mistakes to avoid saying

- ❌ "Polymorphic is bad." It's a trade-off. Whether it's "bad"
  depends on whether you need FK constraints.
- ❌ "I'd just use NoSQL for this." That's a different problem; the
  whole rest of the app benefits from relational guarantees.

## Go deeper

- Search "polymorphic associations Rails" — Rails has a strong
  opinion (single string FK + class name).
- Postgres CHECK constraints — how to enforce "exactly one of N
  columns is non-null."
