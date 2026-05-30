# Workflow 05 — Submissions

> **In plain English.** A submission is "we put candidate X forward
> for job Y." It has a status that moves through a pipeline:
> SUBMITTED → … → JOINED (or REJECTED, ON_HOLD). This is where the
> day-to-day recruiting work shows up.

**Who uses it:** everyone.

## The list page (`/submissions`)

**What you see.**

- Page header + "Create submission" button.
- FilterBar: status, job, candidate, recruiter, client, vendor,
  source, date range, search.
- Table: 10/page, sortable, column picker.

**Default columns.** S.No · ID · Candidate · Job · Client · Vendor ·
Submitted by · Status · Rounds · Submitted.

## Create submission (`/submissions/new`)

Pre-fills `jobId` / `candidateId` from the query string when called
from a Job or Candidate detail page.

**The form.**

- **Candidate** (required) — searchable picker.
- **Job** (required) — searchable picker.
- **Submitted by** (required, default = you).
- **Candidate rate** (optional).
- **Résumé** (optional but recommended) — pick from the candidate's
  résumé library, *or* add one inline (label + Drive link). The
  chosen link is **snapshotted** onto `Submission.resumeDriveLink`;
  `candidateResumeId` FK references the live library row.
- **Submission notes** (optional).

**Duplicate prevention.** Before the DB-level unique constraint was
dropped (migration `20260526150000_interview_tz_and_dup_override`),
re-submitting the same candidate to the same job hard-errored. Now
the *action* checks for the duplicate and returns
`needsConfirm: true` + a `duplicateReason` field error. The form
shows the warning, the user types a reason, the resubmit goes
through, and the audit row captures the reason.

**Every button + what it does**

- **Submit** → `createSubmission` action. Writes new Submission +
  `CANDIDATE_SUBMITTED` audit row. Redirects to
  `/submissions/<id>`.

**Code map**

- Page: `src/app/(dashboard)/submissions/page.tsx`.
- Table: `src/components/submissions/submissions-table.tsx`.
- New page: `src/app/(dashboard)/submissions/new/page.tsx`.
- Form: `src/components/submissions/submission-form.tsx`.
- Edit form: `src/components/submissions/submission-edit-form.tsx`.
- Status form: `src/components/submissions/submission-status-form.tsx`.
- Filters: `src/components/submissions/submission-filters.tsx`.
- Status pipeline visual: `src/components/submissions/status-pipeline.tsx`.
- Actions: `src/server/actions/submissions.ts`.
- Queries: `src/server/queries/submissions.ts`.

## Submission detail (`/submissions/<id>`)

**Layout.**

- Page header: candidate name → job title, display ID, status badge.
  "Edit submission" link (rate / résumé / notes only).
- **Status pipeline** — horizontal indicator of the current stage.
- **Status form** — change the status with optional event-date, note,
  and reason preset.
- Cards: Candidate (link), Job (link), Submitted by, Rate, Résumé
  preview (inline iframe).
- **Interview rounds manager** — see
  [`06-interview-rounds.md`](./06-interview-rounds.md).
- **Notes** + **Activity timeline**.

**Every interactive element**

- **Edit submission** → `/submissions/<id>/edit`. Lets the rate,
  résumé, and notes change. Candidate, job, recruiter stay fixed at
  creation (use status form for status changes). Audit:
  `SUBMISSION_UPDATED`.
- **Status form (Update status)** → `updateSubmissionStatus` action.
  Captures `eventAt`, `note`, and `reason` on the audit row. Audit:
  `SUBMISSION_STATUS_CHANGED` plus convenience actions
  (`CANDIDATE_SELECTED` / `CANDIDATE_REJECTED` / `OFFER_RELEASED` /
  `OFFER_ACCEPTED` / `CANDIDATE_JOINED`) for status-driven entries.
- **Add round** → `InterviewRoundForm`; calls `createRound`; audit
  `INTERVIEW_ROUND_ADDED`.

## Status pipeline

The pipeline is data-driven:

```
SUBMITTED → RESUME_PICKED → VENDOR_SCREENING_CALL → CLIENT_INTERVIEW
   → SELECTED → OFFER_RELEASED → OFFER_ACCEPTED → JOINED
   ↓ ↓
   ↓ ↓ (any time)
   ↓ REJECTED  /  ON_HOLD
```

The pipeline component visualises *where you are*; the form sets the
new value. The DB doesn't enforce ordering — recruiters sometimes
jump steps when a vendor abbreviates the process.

When `status = OFFER_ACCEPTED`, the form prompts for
`expectedJoinDate`. When `status = JOINED`, it prompts for
`actualJoinDate` (defaults to today). These hit the Submission
columns, not just the audit row.

## Validation

See `src/lib/validation/submission.ts`:
- Either `candidateResumeId` *or* an inline résumé pair (label +
  Drive link), or neither. Snapshot link computed accordingly.
- Rate is non-negative.
- Notes ≤5000 chars.

## Why we built it this way

- **Duplicate as action-layer check.** A hard DB unique constraint
  meant the team couldn't legitimately re-submit (different rate,
  refreshed résumé, etc.). Action-level with a captured reason is
  more flexible and still auditable.
- **Résumé snapshot + FK.** If the library entry is edited or archived
  later, we still know what was sent at submission time — and because
  removing a résumé *archives* it (soft delete) rather than deleting,
  the `candidateResumeId` FK link survives too. The edit form still
  offers an archived résumé when this submission is the one using it,
  labelled "(archived)".
- **Status-change extras.** Recruiters wanted to record "the
  rejection email came yesterday but I'm only logging it now."
  `eventAt` captures real-world time separately from `createdAt`
  (recording time).
- **Convenience action enum values.** Audit filters by action can
  hit `CANDIDATE_JOINED` directly without parsing
  `SUBMISSION_STATUS_CHANGED` rows. Costs nothing; helps the audit
  page and reports.
