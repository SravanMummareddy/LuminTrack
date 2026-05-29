# 09 — Audit log and the timeline

> **In plain English.** Every meaningful write — creating a job,
> moving a submission to "Selected", scheduling an interview — drops
> a row into one big `Activity` table. The timeline UI on each
> detail page reads from that table to show "what's happened to
> this thing." Nothing is allowed to write to the database without
> writing here too.

## Why this matters

The original requirements ask "what is the full activity history for
each job/candidate/submission?" — that question is unanswerable
unless every mutation reliably writes an audit row. We picked a
strict invariant rather than a soft "remember to do it" convention.

## The invariant

> **Every mutating Server Action runs its DB write and its
> `logActivity()` call inside the same `prisma.$transaction`.**

If a developer forgets the audit row, code review bounces the PR. If
they remember but split it across two queries (data write commits,
audit row fails) the timeline silently rots. The transaction
guarantees both-or-neither.

```ts
// src/server/actions/submissions.ts (excerpt)
await prisma.$transaction(async (tx) => {
  const updated = await tx.submission.update({
    where: { id },
    data: { status: nextStatus, /* ... */ },
  });
  await logActivity(tx, {
    entityType: "SUBMISSION",
    action: "SUBMISSION_STATUS_CHANGED",
    submissionId: id,
    performedById: user.id,
    description: `Status: ${oldStatus} → ${nextStatus}`,
    oldValue: oldStatus,
    newValue: nextStatus,
    eventAt,    // when the real-world event happened
    note,       // recruiter's free-text note
    reason,     // preset reason from a dropdown
  });
});
```

## The `Activity` table

See `model Activity` in `prisma/schema.prisma`. Notable columns:

- `entityType: EntityType` — discriminator: `JOB | CANDIDATE |
  SUBMISSION | INTERVIEW_ROUND`.
- `action: ActivityAction` — what happened (the enum lives at the
  top of the schema, includes 30+ values).
- `description: String` — human-readable summary the UI shows.
- `oldValue` / `newValue` — for updates that change a single value
  (status, etc.). Both nullable.
- `eventAt`, `note`, `reason` — optional context captured on a
  status change.
- Four nullable FKs (`jobId`, `candidateId`, `submissionId`,
  `interviewRoundId`) — exactly one is set, matching `entityType`.
- `performedById` — the User who did it.
- `createdAt` — when the audit row was inserted (not the same as
  `eventAt`, which is when the real-world event happened).

## `logActivity()` helper

`src/server/activity.ts` exports one function:

```ts
export function logActivity(db: Prisma.TransactionClient, input: LogActivityInput) {
  return db.activity.create({ data: { ... } });
}
```

The signature takes `Prisma.TransactionClient` (not the regular
client) — the type system stops you from calling it outside a
transaction.

## The `ActivityAction` enum

Today the enum has these values (see `prisma/schema.prisma`):

```
JOB_CREATED        JOB_UPDATED
CANDIDATE_CREATED  CANDIDATE_UPDATED  CANDIDATE_CONTACTED
CANDIDATE_SUBMITTED
SUBMISSION_STATUS_CHANGED  SUBMISSION_UPDATED
RECRUITER_ASSIGNED  RECRUITER_UNASSIGNED
INTERVIEW_ROUND_ADDED  INTERVIEW_RESCHEDULED  INTERVIEW_RESULT_UPDATED
INTERVIEW_ROUND_DELETED
FEEDBACK_ADDED  NOTE_ADDED
RESUME_ADDED  RESUME_UPDATED  RESUME_DELETED
CANDIDATE_SELECTED  CANDIDATE_REJECTED
OFFER_RELEASED  OFFER_ACCEPTED  CANDIDATE_JOINED
REQUISITIONS_IMPORTED  JOB_IMPORTED
```

Some are emitted only by `updateSubmissionStatus` as a convenience
("selected"/"rejected"/"joined") so timeline filtering by action key
hits the right rows. Others (REQUISITIONS_IMPORTED, JOB_IMPORTED)
are bulk-import markers.

## Reading the audit log — `getTimelineFor()`

`src/server/queries/timeline.ts` exports one function the detail
pages call:

```ts
getTimelineFor("JOB", jobId)
getTimelineFor("CANDIDATE", candId)
getTimelineFor("SUBMISSION", subId)
```

Each variant rolls up activity of descendants:

- **Job timeline** — own Activity + every Submission's + every
  Round's. So opening `/jobs/xyz` shows the whole story end-to-end.
- **Candidate timeline** — same, scoped to that candidate.
- **Submission timeline** — own Activity + its Rounds'.

Capped at `TIMELINE_MAX = 200` rows. The UI defaults to showing 5 and
pages by 20 when expanded.

## The timeline UI

`src/components/timeline/` is a Client Component that:
1. Renders the latest 5 entries by default.
2. Has a "Show more" toggle that expands to 30; if the activity is
   chatty, it pages 20-at-a-time.
3. Each entry shows: icon (per action), description, actor name,
   relative time, and any captured `note` / `reason`.

It's a Client Component because the expand/collapse + paginate are
client state. The data is fetched server-side and passed as a prop.

## The standalone `/audit` page

Admins also get a global feed at `/audit`. It's the same `Activity`
table but unfiltered by entity — filterable by action, user, and
date range, paginated 25/page. Useful for "what did the team do
yesterday?" and for spotting anomalies.

Code:
- Route: `src/app/(dashboard)/audit/page.tsx`.
- Query: `src/server/queries/timeline.ts` (admin-scoped query helper
  in the same file or a sibling).
- Admin-only — non-admins see `<Forbidden />`.

## Audit gotchas

### "I bumped `updatedAt` but no audit row"
If your action is *cosmetic* (a UI-only field that doesn't change
business state), you can skip the audit row. But if anyone might
want to know that change happened, log it. When in doubt: log it.

### "I'm deleting something"
Deletes are audited too. Look at `INTERVIEW_ROUND_DELETED` /
`RESUME_DELETED` for the pattern: the audit row captures enough
context to know *what* was deleted, since the row itself will be
gone.

### "What if the transaction fails after the audit row?"
Impossible by construction — they're in the same transaction. If the
data write rolls back, so does the audit row.

### "Can I read Activity directly from a page?"
Yes, but prefer `getTimelineFor()` so the descendant-roll-up logic
stays in one place. Direct reads are fine for the admin /audit page,
which deliberately bypasses the entity scope.
