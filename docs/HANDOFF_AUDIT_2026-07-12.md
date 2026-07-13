# Pre-handoff bug audit — 2026-07-12

Multi-agent adversarial sweep before owner handoff. 8 reviewer dimensions
(Decimal leaks · soft-delete/scope · permission gaps · correctness · Next16/React19
gotchas · dead code · UI/UX · data integrity) → each raw finding independently
verified to kill false positives. **14 raw → 10 confirmed → all 10 fixed.**

Baseline before + after: `tsc` clean · 364/364 unit tests · production build green.

No criticals or highs — the server query/action layer is solid. All findings are
medium/low correctness, reporting-accuracy, and UX-feedback gaps.

## Fixed

| # | Sev | File | Bug | Fix |
|---|-----|------|-----|-----|
| 1 | med | `src/lib/analytics.ts` | `buildSubmissionWhere` omitted `deletedAt` — recruiter Reports/Dashboard/Recruiters analytics counted submissions to **trashed/erased** jobs & candidates, so numbers didn't reconcile with the source scoreboard (which *does* filter). | Added `candidate: { deletedAt: null }` + `job.deletedAt: null` to the shared builder — one change fixes all four surfaces. |
| 2 | med | `src/server/queries/monthly-scorecard.ts` | Same gap across all 5 scorecard aggregations (submissions, interviews, status-events, company-wide vendor scan) — over-credited recruiters for work on since-removed records. | Added `candidate/job deletedAt: null` guard to every where clause. |
| 3 | med | `src/components/submissions/submission-form.tsx` | Prefill fetch on job change had no out-of-order guard — rapidly re-selecting the Job picker could let a slow earlier response overwrite the newer job's **rates** (wrong commercial terms submittable). | `latestPrefillJob` ref set before the await; stale resolutions bail before `setFields`. |
| 4 | low | `src/components/settings/account-section.tsx` | All 3 account forms keyed their success toast on `[state.ok]` (a boolean that stays `true`), so a **2nd consecutive save fired no toast** (and the password form didn't re-clear). | Key the effect on the fresh `[state, toast]` object, matching `notes-section.tsx`. |
| 5 | low | `src/app/api/resumes/[id]/route.ts` | Docstring claimed legacy Google-Drive résumés "redirect to the Drive link"; code actually 404s (Drive was retired). Misleading for debugging. | Corrected the comment. |
| 6 | low | `src/components/candidates/mark-contacted-button.tsx` | `await markCandidateContacted()` with no try/catch — on failure (expired session, DB error) the action silently no-ops with zero user feedback. | Wrapped in try/catch + error toast. |
| 7 | low | `src/components/candidates/candidate-bulk-bar.tsx` | Bulk archive/tag (and trash) had no error handling — a failed bulk action left the selection bar open with no indication, read as success. | try/catch + error toast in both `run()` and `trash()`. |
| 8 | low | `candidate-trash-banner.tsx` + `jobs/job-trash-banner.tsx` | Restore buttons were plain submits with no pending/disabled state → double-submit + no click acknowledgement (inconsistent with the Erase buttons beside them). | New shared `SubmitButton` (`useFormStatus`) — disables + shows "Restoring…" while in flight. |
| 9 | low | `src/server/actions/contacts.ts` | `saveContact` edit path applied the request's `kind`/`parentId` without verifying the contact belonged to that parent — a crafted POST could **reparent a contact** to another entity (and demote the new parent's primary). Contacts write no audit row. | On edit, load the existing contact and reject if its parent FK ≠ submitted `parentId`. |
| 10 | low | `src/server/actions/interviews.ts` | `createInterviewRound` read max `roundOrder` outside the tx with no unique constraint — concurrent "Add round" submits could produce **duplicate round numbers**. | Moved the read inside the tx behind a `pg_advisory_xact_lock` (reused `hashPair`), matching `createSubmissionRecord`. |
| 11 | low | `src/components/settings/admin-tools-disclosure.tsx` | Settings "Admin tools" summary advertised "**Import · Import history**" — stale copy for the iLabor import UI deleted 2026-07-10; the card only contains Audit log + Export data. (Found in the live browser pass.) | Trimmed the summary to "Audit log · Export data" and dropped the stale "import-heavy week" comment. |

## False positives killed by the verify pass (4)

Not logged in detail — each was refuted by reading the actual code (guard existed
upstream, value flattened before reaching a Client Component, or consumed only in a
Server Component).

## Not covered here

- **Live browser UI/UX pass** — this audit was static (source-level). A logged-in
  click-through of the new dashboard/org-chart/interview-schedule views against
  seeded data is still worth doing before handoff (see WORKLIST "Needs testing").
- **Owner-decision-gated items** (D5/D9/D14) and parked enhancements are unchanged —
  those are product decisions, not bugs.
