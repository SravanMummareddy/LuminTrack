# 07 — Audit-log design

> **In plain English.** An audit log is a permanent record of "who
> did what, when, to what." It's a separate table that every write
> appends to. Done right, it lets you answer "what happened to
> this customer's order yesterday?" without paging through git
> history or asking around.

## The technical core

A good audit log has these properties:

1. **Append-only.** Never updated, never deleted. Once written, it
   tells the truth.
2. **Atomically tied to the write that produced it.** No "data row
   exists without its audit row" possibility (see
   [`06-transactions-and-acid.md`](./06-transactions-and-acid.md)).
3. **Self-contained.** Includes enough context to be readable
   later — actor, action, entity, before/after snapshots.
4. **Queryable by both who and what.** Indexes on actor, entity,
   timestamp.

### Designs you'll see in the wild

| Pattern               | Description                                          |
|-----------------------|------------------------------------------------------|
| Single polymorphic table | One `Activity` table with nullable FKs to each entity type and a discriminator column. |
| Table-per-entity       | `JobActivity`, `CandidateActivity`, etc.            |
| Event-sourced          | The state itself is a fold over events; no "current" tables. |
| Trigger-based          | Postgres triggers write the audit row, so app code can't forget. |
| Change Data Capture    | A stream (Debezium etc.) replicates the WAL into an analytics store. |

LuminTrack uses the polymorphic table pattern.

### Trade-offs of polymorphic

- ✅ One indexed lookup answers "everything that touched this job."
- ✅ Adding a new entity type is just a new nullable FK.
- ❌ No DB-level "exactly one FK is set" constraint (could add via
  CHECK; we let `logActivity()` enforce in code).
- ❌ Joins to one of many parents look a bit awkward.

## Where it lives in LuminTrack

- **The model.** `prisma/schema.prisma` → `model Activity` with
  four nullable FKs (`jobId`, `candidateId`, `submissionId`,
  `interviewRoundId`) + an `entityType` discriminator.
- **The action enum.** `ActivityAction` covers 30+ values:
  `JOB_CREATED`, `SUBMISSION_STATUS_CHANGED`, `JOB_IMPORTED`, etc.
- **The helper.** `src/server/activity.ts` exports `logActivity()`.
  Its signature takes `Prisma.TransactionClient` so the type
  system stops you from calling it outside a transaction.
- **Querying.** `src/server/queries/timeline.ts` exposes
  `getTimelineFor(entityType, id)` which rolls up an entity's
  Activity with its descendants' (a Job timeline includes its
  Submissions' and their Rounds').

## How to talk about it in an interview

**Sample answer (90 sec):**

> "I designed the audit log as a single polymorphic table called
> `Activity`. It has nullable foreign keys to each entity type —
> Job, Candidate, Submission, InterviewRound — plus an `entityType`
> discriminator and an `action` enum. Exactly one FK is set per
> row, matching the discriminator. Every mutating Server Action
> writes both its data change and the activity row inside a single
> `prisma.$transaction`, so they're atomic — you can never have a
> change without its audit row. The polymorphic shape means the
> 'show me everything that touched this job' query is one indexed
> lookup. The descendant-rollup happens at read time: a Job's
> timeline includes its Submissions' activities and their Rounds'.
> I'd consider event sourcing for a higher-stakes domain, but
> append-only audit + current-state-tables is the right trade-off
> for a recruiting tool — the auditors get the trail, the
> recruiters get fast list views."

**Expect:**

- "How would you guarantee no one writes outside the audit log?"
  → DB triggers, or in our case, the type signature of
  `logActivity` requiring a TransactionClient.
- "What if the audit table grows huge?" → Partition by month,
  archive cold partitions to cheaper storage, query via a view.
- "What's the cost of polymorphic?" → No FK-level "exactly one set"
  constraint; awkward joins; mitigated by the discriminator + app
  invariant.

## Mistakes to avoid saying

- ❌ "We're event-sourced." Be precise — LuminTrack is *not*
  event-sourced. We have current-state tables AND an audit log.
- ❌ "We trigger audit at the DB layer." We don't. App code +
  transactions enforce the invariant.

## Go deeper

- Martin Fowler: ["Audit Log" pattern](https://martinfowler.com/eaaDev/AuditLog.html).
- Designing Data-Intensive Applications, ch. 11 (Stream Processing /
  event-sourced systems).
- Stripe and Shopify engineering blogs on their audit + event
  pipelines.
