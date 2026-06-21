# PLAN — Submission & Workflow UX Overhaul (Round 5)

> **Status: IN PROGRESS.** Build started 2026-05-29. Phase-by-phase with
> owner confirmation between phases; additive — existing flows keep working
> for anyone not exercising the new paths.

## Context

Early owner feedback (2026-05-29): "a lot of changes" needed to **how
submissions are done, what columns to show, and which features to elevate** —
specifically *assigning jobs to recruiters → submitting candidates*, plus the
surrounding **flow, confirmations, clear UI, instructions, and workflow**. Goal:
make LuminTrack decisively better than the Excel/Word process it replaces for a
<10-person team.

A 5-persona audit (daily recruiter, recruiting manager/admin, UX designer, PM,
QA) was run; all five independently converged on the same core problems. The
working copy of the audit + plan lives at
`~/.claude/plans/i-got-a-initial-cozy-sloth.md`; this file is the repo-durable
version.

## Owner decisions

1. **Submissions are gated by assignment, with self-claim.** A recruiter not
   assigned to a job cannot submit until assigned; they can click **"Claim this
   job"** (creates a `JobAssignment` to themselves, logged via
   `RECRUITER_ASSIGNED`), then submit. Admins submit to any job and assign anyone.
2. **Three submit entry points, one shared form:** keep the job page, ADD
   "Submit to a job" on the candidate page, ADD "New submission" on `/submissions`.
3. **Preset reason list + optional note** for override gates and status-change
   reasons (replaces free text → analyzable audit data).
4. **All four areas in scope:** submission flow, assignment workflow,
   columns/density, confirmations/feedback.

### Defaulted (owner can override later)
- iLabor cap/closed override stays recruiter-self-serve but gets flagged for
  review (not admin-only escalation).
- Recruiter performance still credits the **submitter** (`submittedById`); admins
  gain a path to **re-attribute** it after creation.
- **S.No** becomes hidden-by-default on lists but stays available in the columns menu.

## The problems (cross-persona themes, worst first)

1. **Silent successes.** Status changes, note creation, and the job-detail status
   select complete with no toast/banner/"Saved ✓"; the app has **no toast system**.
   The highest-stakes write (→ JOINED, which cascades into `Placement` creation +
   `Candidate.status` flip) gives zero feedback. An *unchanged* status returns a
   red error while a *changed* one succeeds silently. *(all 5 personas)*
2. **One submission entry point.** Submissions can only start from `/jobs/[id]`;
   the candidate page and `/submissions` are dead ends. ~5 clicks for the most
   frequent action. *(all 5)*
3. **Recruiter→job assignment is decorative.** `createSubmission` never reads
   `JobAssignment`; anyone submits anything anywhere; admins get no "my jobs" view. *(all 5)*
4. **Override gates are toothless & brittle.** Duplicate / iLabor-closed /
   iLabor-cap all collapse into one free-text box ("x" passes), self-approved; the
   form picks the override field via `error.startsWith("iLabor")`. *(all 5)*
5. **No inline editing.** Every correction is a drill-down; pushes recruiters back
   to a spreadsheet. *(all 5)*
6. **Submissions columns** miss "days in stage" / "mine, stale >7d"; redundant
   S.No + display-ID double-number. *(all 5)*
7. Résumé silently wiped on candidate switch. *(3)*
8. Inconsistent confirmations; native `window.confirm` in 4 delete paths. *(designer + QA)*
9. `submittedById` freely-set, locked, uncorrectable — yet drives all scorecards. *(admin)*
10. No onboarding for an Excel-migrating team. *(3)*

## Phased plan

Reasons = `labels.ts` string sets (mirrors `STATUS_CHANGE_REASONS`), persisted to
existing `Activity.note`/`reason` → **zero reason migrations**. `RECRUITER_ASSIGNED`
enum value already exists → self-claim needs no migration. The only possible schema
change is an optional `Activity.isOverride` boolean (Phase 5e).

### Phase 1 — Foundations: toast primitive + typed gate kind *(everything depends on these)*
- **Create** `src/components/ui/toast.tsx` — `"use client"` `ToastProvider` +
  `useToast()`; fixed bottom-right stack, auto-dismiss, tones reusing the existing
  `Badge`/`Dialog` color language + `lucide-react`.
- **Modify** `src/app/(dashboard)/layout.tsx` — wrap `children` in `<ToastProvider>`
  (separate client module; the layout stays an async server component).
- **Modify** `src/lib/form-state.ts` — `needsConfirm: boolean` → typed union
  `"duplicate" | "ilabor_closed" | "ilabor_cap" | "not_assigned"`; add
  `confirmData?: { cap?; active?; existingSubmissionId? }`.
- **Modify** `createSubmission` (`src/server/actions/submissions.ts`) — stop
  collapsing the internal gate union; return the typed kind + `confirmData`.
- **Modify** `src/components/submissions/submission-form.tsx` — delete the
  `startsWith("iLabor")` IIFE; switch on `state.needsConfirm`; replace the
  free-text override `<Input>` with a preset `<Select>` + optional note; render
  concrete numbers + a link to the existing submission.
- **Modify** `src/lib/labels.ts` — add `OVERRIDE_REASONS` + label map.

### Phase 2 — Assignment-gated submissions + self-claim + three entry points
- `createSubmission`: fetch caller's assignment; branch admin → proceed; assigned →
  proceed; not-assigned + `claim` flag → create `JobAssignment` + `RECRUITER_ASSIGNED`
  audit **inside the existing tx** (idempotent vs `@@unique([jobId,recruiterId])`),
  then submit; not-assigned + no claim → `needsConfirm: "not_assigned"` so the form
  shows **"Claim this job & submit"**. Reuse the `assignJobRecruiters` audit pattern.
- `submission-form.tsx`: replace the `jobId` prop with a discriminated `mode`
  (`"job-locked"` | `"candidate-locked"` | `"open"`) — only the two `<Select>`/
  hidden-input blocks become conditional. **Single component, no fork.** Fold in the
  résumé-switch warning here.
- Entry points: keep `jobs/[id]/submissions/new`; create
  `candidates/[id]/submissions/new/page.tsx` + a "Submit to a job" button on the
  candidate detail header; create `submissions/new/page.tsx` + a "New submission"
  button on the `/submissions` header.
- Create `listJobOptions()` in `src/server/queries/jobs.ts` (mirror `listCandidateOptions`).

### Phase 3 — Wire toasts to silent successes + replace native confirms
- `submission-status-form.tsx` — toast on `state.ok`; JOINED → bubble created
  placement display id and toast "Placement PLC-0xx created".
- `notes-section.tsx` — toast "Note added" (ensure `createNote` returns `{ ok }`).
- Job-detail status select — convert `changeJobStatus` (void direct-form action) to
  a `FormState`-returning action + a small `job-status-form.tsx` client wrapper.
- Create `src/components/ui/confirm-dialog.tsx`; replace `window.confirm` in
  `resume-section.tsx`, `documents-manager.tsx`, `interview-rounds-manager.tsx`,
  `settings/contacts-dialog.tsx`.

### Phase 4 — Submissions list upgrades *(already has ColumnsMenu — additive)*
- Days-in-stage column: extract `STATUS_TRANSITION_ACTIONS` + `currentStageDays()`
  into `src/lib/analytics.ts`; in `listSubmissions`, one batched
  `activity.findMany({ where: { submissionId: { in: pageIds } } })` (no N+1);
  attach `daysInStage`; amber highlight >7d; in-memory sort; bump `STORAGE_VERSION`.
- Drop S.No from default-visible (keep in menu).
- "Mine, stale >7d" quick filter (reuse `STALE_STATUSES` from `reports.ts`).
- Inline status change cell modeled on `JobRecruitersCell`.

### Phase 5 — Smaller items + polish
- Admin re-attribution of `submittedById` in `updateSubmission` (admin-only;
  logs `SUBMISSION_UPDATED`).
- Flag prefilled candidate rate as an unconfirmed default.
- Relabel "When this happened" → "Effective date/time" + (i) tooltip.
- Onboarding checklist on the dashboard + richer empty states.
- *(Optional)* `Activity.isOverride` boolean for visible override badges.

## Cross-cutting gotchas
- Toast provider must be a `"use client"` module wrapped around `children` in the
  async dashboard layout.
- `needsConfirm` type change (boolean → union) only affects `submission-form.tsx`.
- Self-claim insert must be **inside** the submission tx (atomic, idempotent).
- Days-in-stage can't be a Prisma `orderBy` — sort in memory over the page.
- Next 16 / React 19: `await params`/`searchParams`; seed `datetime-local` defaults in `useEffect`.
- `changeJobStatus` is a void direct-form action — convert before toasting.

## Verification
`npx tsx prisma/seed-demo.ts` (admin `admin@lumintrack.com` / `LuminTrack2026!`),
then: assignment gate (claim flow + audit) → three entry points all land on
`/submissions/[id]` → typed gates (duplicate link, cap numbers) → toasts (incl.
JOINED→placement, note, job status; none on login) → four confirm dialogs → list
(days-in-stage amber >7d + sort, S.No hidden but available, "Mine, stale >7d"
filter, inline status change) → admin re-attribution → `npm run lint` + typecheck
(the `FormState` and `changeJobStatus` signature changes are the likely TS hotspots).
