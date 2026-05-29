# Story 05 — Dropping the unique constraint on submissions

## Question this answers

- "A time you changed your mind about a design decision."
- "A migration that needed care."
- "A time you balanced data integrity with UX."

## Situation

The original `Submission` model had a database-level
`@@unique([candidateId, jobId])` — meaning the same candidate
couldn't be submitted to the same job twice. Clean, safe,
enforced by Postgres.

Two months in, the team flagged a real workflow: legitimate
re-submissions. A candidate's rate is updated. A new résumé tuned
for the role is created. The team wanted to *re-submit* with the
new info, keeping the old record for history. The unique
constraint blocked them and the error was an opaque P2002.

## Task

Allow re-submissions without losing the protection against
accidental duplicate clicks. Capture *why* a duplicate is
intentional so the audit trail remains useful.

## Action

1. **Mapped the trade-off.** Hard constraint = data safety, blunt
   UX. App-level check = nuanced UX, requires discipline.
2. **Designed the new flow:**
   - Action checks for an existing submission at the same
     (candidate, job) pair.
   - If found, returns `{ needsConfirm: true, fieldErrors: {
     duplicateReason: "Required to override" } }`.
   - Form reveals a hidden `duplicateReason` text field + an
     `override=true` hidden flag.
   - Resubmit captures the reason on the new Submission's
     `duplicateReason` column and writes a custom audit note.
3. **Two-phase migration** to make rollback safe:
   - **Migration A:** add the `Submission.duplicateReason String?`
     column AND the `InterviewRound.scheduledTimezone String?`
     column (paired in `20260526150000_interview_tz_and_dup_override`).
     Application code starts checking duplicates in the action
     and capturing reasons.
   - **Migration B:** drop the unique index. Now genuinely
     allowed at the DB layer.
   Doing both in one migration would have been faster but unsafe
   — between deploy and migration the old code could throw P2002s
   with the new UI expecting `needsConfirm`.
4. **Updated the audit log.** When a duplicate is overridden, the
   `CANDIDATE_SUBMITTED` activity row's `note` includes the
   reason so the timeline reads cleanly.
5. **Verified end-to-end.** First submit goes through. Second
   submit at same (candidate, job) returns the warning. Entering
   a reason and resubmitting succeeds and the audit row reads
   the override reason.

## Result

- Re-submissions are a first-class workflow, captured with
  intent.
- Audit log remains the truth-teller — every override is logged
  with a reason.
- Old data wasn't broken; the constraint drop is backwards-
  compatible.

## Variant phrasings

- **"A time you replaced a hard rule with a soft one":** I moved
  the duplicate check from the DB layer to the action layer,
  with explicit reason capture.
- **"A time you reversed a previous design":** The unique
  constraint was *my* choice originally. I had to admit it was
  the wrong abstraction once the workflow showed up.
- **"A time you cared about migration safety":** Two-phase
  migration with a compatibility window in the middle.

## Honest caveats

- The action-layer check has a race condition window: two
  concurrent re-submits could both pass the existence check. The
  team's <10 users make this near-impossible in practice; for a
  customer-facing app I'd add a more careful guard (insert with
  `ON CONFLICT DO NOTHING` and inspect the result).
- I should have written a test for the override flow. Verified
  manually instead.
