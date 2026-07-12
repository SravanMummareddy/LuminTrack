# ⤵ Reconciled 2026-07-05 — read this first

Baseline: `main` @ `23c4f86` (no open PRs, tsc clean, 113 unit tests). The dated
sweeps below are historical; much has shipped since. For the current "what shipped"
picture see **CLAUDE.md** ("🚧 Current work" sections) and **`docs/DEVLOG.md`**.

**Previously-"remaining" items now confirmed shipped** (do NOT re-pick):
- `error.tsx` + `not-found.tsx` for the dashboard segment — both exist under `src/app/(dashboard)/`.
- Dialog focus trap + return-focus on close (Polish Round 2).
- Auth/logout hardened — unauth/dead-session requests hit `GET /api/auth/logout` which clears
  the cookie (see DEVLOG 2026-06-22 redirect-loop entry).
- clientRate wired everywhere + the two clientRate bugs (Decimal leak, convert drop) — see DEVLOG.

**Candidate still-open small items** (verify against current code before starting):
- Global search doesn't index display IDs (CAND-001 / REQ-159263 / JOB-00001) — `src/server/queries/search.ts`.
- Reports: per-source conversion-rate breakdown column.
- Mobile topbar search overlaps avatar on narrow tablets.
- Recruiter-detail "Submissions" sub-table sorting.
- Bulk status update UI (select N submissions → set status).
- Saved filters / views ("my open jobs" one-click pin).

**From the 2026-06-22 QA sweep** (`test-results/QA_UX_REPORT_2026-06-22.md`, low severity):
- `not-found.tsx` hydration `className` mismatch warning on 404 pages.
- Résumé-preview shows a tall empty box when a Drive link can't embed.
- Scorecard runs past the right edge at 1440px — wants a horizontal-scroll affordance.

**From the 2026-07-08 prod eyeball** (owner dogfooding `lumin-track.vercel.app`;
analysis in `~/.claude/plans/i-am-logging-bugs-floofy-hoare.md`):
- ✅ **FIXED (2026-07-08).** **[P2] Stale gate warning after changing the candidate.**
  On the VPR→submission **convert** form, changing the Candidate dropdown left the amber
  gate showing the *previous* candidate's name. `useActionState`'s `state` can't be reset
  imperatively, so the fix suppresses a gate whose candidate/job context has since changed
  (`gateDismissed` flag) and clears it on the next action result, plus blanks the override
  reason fields on anchor change so a "reason to move anyway" never rides into a new
  context (`submission-form.tsx` — `dismissStaleGate`, `gate = gateDismissed ? undefined :
  state.needsConfirm`, and the general-error box now also respects it). Covers the
  duplicate / iLabor / `rate_chain` / `candidate_status` gates. (Edit form has no
  anchor-change vector — candidate/job are fixed at creation — so it's unaffected.)
- ✅ **FIXED (2026-07-08).** **[P2] Row height doubles when the "Created" column is shown
  on `/candidates`.** Added `whitespace-nowrap` to the Name/Email/Phone/Location cells
  (`candidates-table.tsx`), so extra columns produce horizontal scroll (the `<Table>`
  already has `overflow-x-auto`) instead of wrapping to two lines. The larger "resizable
  columns" ask stays in `ENHANCEMENTS.md`.
- ✅ **ADDRESSED (2026-07-08).** Résumé uploaded via "Upload a new resume" already persists
  to the candidate's library (`uploadCandidateResume` — verified). Added the missing copy:
  the inline upload now says "Saved to this candidate's résumé library and selected for
  this submission."

**Large deferred items** live in [`ENHANCEMENTS.md`](./ENHANCEMENTS.md). **Pending owner
decisions** (rate model, retire Candidate rate, "New vendors" semantics, guardrail
strictness, cap requirements per job) are in the walkthrough DOCX.

---

# Remaining work (2026-05-25 sweep)

**✅ Shipped — Round 5 UX-testing fixes + résumé archive (2026-05-29/30).**
Found while driving the app as admin + recruiter personas (Claude-in-Chrome);
full tracker in `docs/ROUND5_UX_FINDINGS.md`. All on `main`, tsc+eslint clean,
verified live.
- `dc0fe1d` — after any submission gate, React 19's post-action `<form>` reset
  snapped controlled `<select>`s to their first option, silently mis-attributing
  `submittedById`. Hidden-input backstop + remount key (`submission-form.tsx`).
- `542c65c` — same fix applied to `submission-edit-form.tsx` (the follow-up).
- `38871b4` — "days in stage > 7d" **amber stale highlight never rendered**:
  `<Td>` bakes in `text-slate-700` and `cn()` was a plain string-join (no
  conflict resolution), so the passed `text-amber-700` lost the cascade.
  **Root-caused + fixed at source 2026-05-30:** `cn()` now uses
  **`tailwind-merge`** (last-wins), killing this *whole class* of defeat — it
  also fixed the reports negative-margin `text-red-600` that was silently
  rendering slate. The submissions cell colour moved back to the cell.
  *(The interim `38871b4` fix had moved the colour to an inner span.)*
- `1a99bc4` — a recruiter on a job that's **both unassigned and iLabor-closed**
  (or capped/duplicate) was trapped in an infinite not_assigned → claim → second
  gate → not_assigned loop (`claim=1` only lived in the not-assigned block).
  Latched `claimIntent`; persists `claim=1` across follow-up gates.
- `cf03c8f` — **résumé archive (soft delete)** (migration
  `20260530052124_resume_soft_delete`): "deleting" a résumé archives it
  (`CandidateResume.isActive`) so submissions keep their link; new picker offers
  active only; edit form keeps an in-use archived résumé labelled "(archived)";
  hard delete only for 0-submission résumés.
- *Loose ends closed 2026-05-30:* iLabor **cap** gate verified live (temp
  `submitLimit=1` → gate "cap of 1 is reached (1 active)", then reverted); all
  delete confirm dialogs are branded `ConfirmSubmit` (résumé / document /
  interview-round / contact); the contact **close-with-unsaved-edits** prompt is
  now a branded dialog (the rare cross-entity-switch guard stays native — it's a
  synchronous render-phase decision). `cn()` → `tailwind-merge` (above).
- *Still unexercised live (code-verified):* **job-status-change** toast (wired in
  `job-status-form.tsx`) + **no-toast-on-login** (structural — `ToastProvider`
  wraps only the authenticated tree).

**✅ Shipped — iLabor import: expired-transaction crash fix (2026-05-28).**
Was: running `/jobs/import` confirm against the 306-row sample failed with
`Transaction API error: A query cannot be executed on an expired
transaction. The timeout for this transaction was 60000 ms…` thrown
from `logActivity` (`src/server/activity.ts:27`). Root cause is
**not** logActivity — it's that `importRequisitions`
(`src/server/actions/ilabor-import.ts:482-682`) wraps the entire
import (advisory lock + portal upsert + existing-rows query + N
vendor/client resolves + ~300 job upserts + per-row JOB_IMPORTED /
JOB_UPDATED audit rows + summary audit) in a single interactive
`prisma.$transaction(..., { timeout: 60_000 })`. ~700–900 sequential
statements on Neon's serverless driver routinely exceed 60s, after
which the next `logActivity` insert throws "expired transaction".
**Fix:** restructured `src/server/actions/ilabor-import.ts` into
(A) session-scoped `pg_try_advisory_lock(817293744)` released in a
`finally` block (was the transaction-scoped `pg_try_advisory_xact_lock`),
(B) un-wrapped prep — portal upsert, existing-rows query, vendor +
client resolve loops, (C) per-row mini `prisma.$transaction(async (tx) => …)`
wrapping `job.upsert` + the conditional `JOB_IMPORTED` / `JOB_UPDATED`
audit so the row-write + row-audit invariant is preserved at the
grain that matters, plus a plain un-wrapped summary
`REQUISITIONS_IMPORTED` audit after the loop. Dropped the
`{ timeout: 60_000 }` option. Trade-off (accepted): cross-row
atomicity gone — a mid-import crash leaves earlier rows committed,
which is preferable for a 300+ row bulk where per-row errors are
already collected. Full write-up in `docs/DEVLOG.md` and original
plan at `~/.claude/plans/invalid-db-activity-create-invocation-in-federated-lynx.md`.

**Small / no migration** — can ship in one PR each:
- ~~**§D4** — interview reschedule audit row.~~ ✅ shipped 2026-05-26
  (commit `ded8b42`; migration `20260526100000_interview_rescheduled_action`
  adds `INTERVIEW_RESCHEDULED` and the action handler logs from→to at
  minute resolution).
- ~~**§K1** — mobile column-picker drag-handle tap targets.~~ ✅ shipped
  2026-05-26 (commit `c7599b4`; grip hidden <sm, ↑/↓ buttons get p-2 +
  h-4 w-4 icons below sm).
- ~~**§H2** — recently-viewed strip in topbar.~~ ✅ shipped 2026-05-26
  (commit `90574fb`; client-only localStorage tracker at
  `lumintrack:recent:v1`, capped at 5 per kind).
- ~~**§C4** — capture duplicate-submission override reason in audit.~~
  ✅ shipped 2026-05-26 (PR #7; migration
  `20260526150000_interview_tz_and_dup_override` drops the unique
  constraint and adds `Submission.duplicateReason`; the action now
  soft-checks and prompts for a reason).

**Medium / migration required:**
- ~~**§C1** — add `OFFER_ACCEPTED` between `OFFER_RELEASED` and `JOINED`.~~
  ✅ shipped 2026-05-26 (commit `2cc3366`; migration
  `20260526110000_offer_accepted_join_dates`).
- ~~**§C2** — `Submission.expectedJoinDate` + `actualJoinDate`.~~
  ✅ shipped 2026-05-26 in the same commit; the status form
  conditionally surfaces the matching date input.
- ~~**§A2** — `Job.workMode` + `Job.priority` enums (plus nullable
  `targetCloseDate`, `postingUrl`, `workAuthRequirement`, `skills[]`).~~
  ✅ shipped 2026-05-26 (commit `45988b5`; migration
  `20260526120000_job_workmode_priority_extras`).
- ~~**§B1** — `Contact` table tied to Client/Vendor/SisterCompanySource.~~
  ✅ shipped 2026-05-26 (migration `20260526130000_contact_records`;
  contacts dialog under each settings tab; CHECK constraint enforces
  one-parent-per-row; admin-gated writes).
- ~~**§B4** — Candidate status reasons enum (`AVAILABLE | PLACED | NOT_INTERESTED | DO_NOT_CONTACT`).~~
  ✅ shipped 2026-05-26 (PR #6; migration `20260526140000_candidate_status_tags_contact_source`).
- ~~**§D5** — interview time-zone string.~~ ✅ shipped 2026-05-26 (PR #7).
- ~~**§E2-E4** — candidate tags/labels, last-contact tracking, per-candidate source.~~
  ✅ shipped 2026-05-26 (PR #6; includes new `markCandidateContacted` action).
- ~~**§F3, F4** — recruiter aging report; revenue projection.~~ ✅ shipped
  2026-05-26 (PR #8; both surface as new tables on `/reports`, no migration).
- ~~**§J2** — admin `/audit` global page.~~ ✅ shipped 2026-05-26 (PR #8;
  new `/audit` route, filterable by action + user, linked from Settings → Admin tools).

**Large items moved out — see [`ENHANCEMENTS.md`](./ENHANCEMENTS.md).**
That file has the ranked queue (§J1 PII export → iLabor 8b extension →
§J3 admin 2FA → §E1 résumé parsing → §J4 session inspector) with full
pros / cons / sizing per item. **§G1-G3 (notifications, digests,
Slack/Teams) and §I4 (dark mode) are deferred indefinitely** on user
direction.

Shipped from the large queue:

- ~~**§F2** — time-to-fill + time-in-stage funnel metrics on `/reports`.~~
  ✅ shipped 2026-05-26 (PR #11; median + p90, no migration, derived
  from existing `SUBMISSION_STATUS_CHANGED` audit rows).

**Stale items already shipped but listed below as open** (verified 2026-05-25):
- Original notes #6, #7, #8 ✅; Round 2 §11 (drift badge) ✅; Skills hint ✅.

---

1. ~~in settings there is no filter option for the avilable fields - mostly care about status~~ — partial: per-row Active/Inactive toggles exist; status-based filter on entity pickers is still §B2.
2. ~~need to add client contacts in setting tab and similarly for vendors - name email and phone and location~~ ✅ **shipped (verified 2026-07-11)** — `Contact` model (name/email/phone/role/isPrimary) links Client · Vendor · SisterCompanySource; managed via `contacts-dialog.tsx` under each settings tab. Both Client and Vendor also carry inline `contactPerson/email/phone/location`.
3. ~~source in jobs need not come from a dropdown list of sister companies — manual "Other" option~~ ✅ shipped.
4. ~~change the name from sister company source to just source.~~ ✅ shipped (audit remaining labels — Round 3 §B3).
5. ~~once candidate is moved from our company how to track it — richer active/inactive status for candidates~~ ✅ **shipped (verified 2026-07-11)** — `CandidateStatus` enum (AVAILABLE / PLACED / NOT_INTERESTED / DO_NOT_CONTACT) is wired into the candidate validation (`candidate.ts:45`) + form. (Free-form status *tags* like "Hot prospect" remain a separate enhancement.)
6. ~~submitted date we are not able to update in update status.~~ ✅ addressed — the status form links to `/submissions/[id]/edit` for correcting the original submitted date.
7. ~~by default show present date and time in when this happened field~~ ✅ shipped — `submission-status-form.tsx` seeds `eventAt` with `nowDateTimeLocal()` on mount.
8. ~~interview round mode/platform dropdown~~ ✅ shipped — `InterviewRound.interviewMode` / `interviewPlatform` + meeting link (Round 4 #1).

---

# Polish round 2 — 2026-05-24 audit

Deep-dive audit across every dashboard tab after the iLabor import (Phases 4–8a)
landed. Three parallel Explore agents covered analytics pages (Dashboard /
Reports / Recruiters), data-entry pages (Jobs / Candidates / Submissions), and
global UX (auth / search / mobile / a11y).

Severity: 🔴 correctness · 🟡 UX gap · ⚪ polish.
Effort: S ≤ 30 min · M ~ 2 hr · L > half day.

**STATUS (2026-05-25): items 1–6, 8–15 shipped + sub-table pagination + collapsed timeline +
column pickers on Candidates/Submissions + shared `ColumnsMenu` with keyboard reorder +
empty-state CTAs + Reports got Joined % (not full per-source split — item 7 partial).
See `git log` 861c90f..e9d5652. Round 3 §A1 (manual job field parity for 7 iLabor columns)
also shipped in the same batch.**

## 🔴 Correctness

✅ 1–6 shipped. ⚠️ 7 partial (Joined % column landed; per-source row-by-row breakdown not yet).

1. ~~**Candidate detail "Job" column links to `/submissions/{id}` instead of `/jobs/{job.id}`**~~ —
   broken nav semantics. `src/app/(dashboard)/candidates/[id]/page.tsx` ~L223. **S**.
2. **Global search doesn't index display IDs.** Typing `CAND-001` / `REQ-159263` /
   `JOB-00001` returns nothing. `src/server/queries/search.ts` ~L14. **M**.
3. **No `error.tsx` / `not-found.tsx`.** Bad job/candidate id crashes with an
   unstyled 500. Add `src/app/(dashboard)/error.tsx` + `not-found.tsx`. **M**.
4. **Dashboard "Active jobs" KPI includes the 305 unowned iLabor jobs** —
   misleading. Split into total vs. assigned, or filter by
   `assignments.some`. `src/server/queries/dashboard.ts` ~L63. **S**.
5. **Recruiter-perf table filters out recruiters with 0 submissions** in the
   window — new recruiters disappear from the list. Show all active recruiters
   with "—" for zero. `src/server/queries/dashboard.ts` ~L95. **S**.
6. **Recruiter "Jobs assigned" count includes closed jobs.** Bulk-closing
   iLabor inflates every recruiter. Filter `JobAssignment` groupBy by
   `job.status: { in: ["OPEN", "ON_HOLD"] }`. `src/server/queries/recruiters.ts`
   ~L102. **S**.
7. **Reports conversion rate mixes iLabor + manual sources.** Admin can't tell
   if 20 % is "good." Per-source breakdown column.
   `src/server/queries/reports.ts` ~L137. **M**.

## 🟡 UX gaps

✅ 8–14 shipped. ✅ 15 shipped (Admin tools card in Settings now surfaces /jobs/import + /jobs/imports).

8. ~~**Candidate + Submission lists have no column picker.**~~ Jobs has the full
   `useColumnPrefs` + drag-reorder. Port the pattern.
   `src/app/(dashboard)/candidates/page.tsx`, `src/app/(dashboard)/submissions/page.tsx`. **M**.
9. **Job-detail "Submitted candidates" sub-table missing Sub ID column** —
   inconsistency with `/submissions` list. `src/app/(dashboard)/jobs/[id]/page.tsx`
   ~L249. **S**.
10. **Candidate form: "Email OR phone required" error attaches to the `email`
    field**, confusing since phone is also optional-looking. Add a hint above
    both fields. `src/lib/validation/candidate.ts` ~L32 +
    `src/components/candidates/candidate-form.tsx` ~L108. **S**.
11. ~~**No visual warning when LuminTrack `status` differs from iLabor
    `externalStatusRaw`.**~~ ✅ shipped — amber "Differs from LuminTrack (X)"
    badge on `/jobs/[id]` next to the iLabor status row
    (`jobs/[id]/page.tsx:96-99,167-171`).
12. **Dialog has no focus trap or focus restoration.** Keyboard / screen-reader
    unfriendly. `src/components/ui/dialog.tsx` ~L38. **M**.
13. **Mobile topbar search overlaps user avatar** on narrow tablets.
    `max-w-md` → `max-w-xs sm:max-w-md`. `src/components/layout/topbar.tsx`
    ~L23. **S**.
14. **`logoutAction` lacks `requireUser()`.** Unauthenticated POSTs are
    silently accepted. `src/server/actions/auth.ts`. **S**.
15. **`/jobs/imports` discoverability** — admin button only shows from the
    Jobs page. Consider also surfacing in Settings, or always-visible
    regardless of source tab. **S**.

## ⚪ Polish

- ~~StatCard tooltips clarifying "what filters are applied."~~ ✅
- ~~"Jobs by source" chart: cap at top-5 + "Other" bucket.~~ ✅
- ~~Recruiter-detail "Submissions" table needs sortable columns / status filter.~~ ✅ (status pill row; sort still TODO)
- ~~Skills field: "Separate with commas" hint.~~ ✅ shipped (`candidate-form.tsx:219`).
- ~~Submission-edit form: `submittedAt` input not marked `required`.~~ ✅
- ~~Settings user form: a checkbox label missing `htmlFor`.~~ ✅
- ~~Default recruiter assignment on new jobs: optional but unclear — add help text or make required.~~ ✅ (help text added)

## Recommended bundle (~90 min)

Items **1, 2, 4, 6, 9, 11** in one PR — covers the highest-value correctness
items + two clear UX gaps without dragging in a11y or column-picker port.

---

# Polish round 3 — 2026-05-24 (post-/compact backlog)

Findings from comparing LuminTrack against the iLabor schema and against
mainstream ATS / CRM products (Greenhouse, Lever, Bullhorn, Workday Recruiting,
Pinpoint, Ashby, JobAdder). The goal of each item is "manager + recruiter
can do their job faster"; correctness is preserved by not changing existing
schema fields, only adding nullable ones.

Severity: 🔴 correctness / pipeline-breaking · 🟡 UX win · ⚪ polish.
Effort: S ≤ 30 min · M ~ 2 hr · L > half day · XL multi-day.

## A. Manual job-add: fields iLabor has, we don't expose

The Job table already stores the iLabor-flavored columns (nullable, populated
only on import). They're invisible to recruiters adding a job manually, but
several genuinely help downstream work. **All proposed adds are nullable —
no migration if we reuse existing columns.**

| Field | Schema column | Recommend | Why it matters |
| --- | --- | --- | --- |
| **# of positions** | `Job.positions` | **Required-ish (default 1)** | Lets dashboard show "openings remaining" vs filled. Today every job is implicitly 1 opening, which inflates "active jobs" and obscures volume. |
| **Position type** (Contract / FTE / C2H) | `Job.reqType` | **Strongly rec.** | Drives candidate filtering ("only show C2H roles"), rate-card sanity checks, and reporting. Without it, recruiters lean on the job title — error-prone. |
| **Projected start / end** | `Job.startDate`, `Job.endDate` | **Recommended** | Contract roles need an SLA on time-to-fill against a real date. Currently we only have `createdAt`. |
| **Duration** | `Job.durationLabel` | Optional | Free-text fallback for "6 months extendable" — many clients don't commit to a hard end date. |
| **Department** | `Job.department` | Recommended | Reporting cut — "how many open Eng vs Ops roles?" The client name isn't enough. |
| **Customer ref / external ID** | `Job.atsId` | Optional | When a client's own ATS gives a req number we want to mirror. Today, recruiters paste it into Notes. |

**Net new fields LuminTrack should also add (not in iLabor either):**

| Field | Suggested column | Recommend | Why |
| --- | --- | --- | --- |
| **Work mode** (Remote / Hybrid / Onsite) | new `Job.workMode` enum | **Required** | The single most-asked candidate question. Every modern ATS has it. Belongs as a top filter on `/jobs`. |
| **Priority** (Low / Med / High / Critical) | new `Job.priority` enum | Recommended | Lets recruiters self-organize. Currently no way for an admin to say "this is the one that matters today". |
| **Target hire-by date** | new `Job.targetCloseDate` | Optional | Distinct from `endDate`. Drives a "you have 5 jobs overdue" stripe on the dashboard. |
| **Job posting URL** | new `Job.postingUrl` | Optional | The public link to the JD on the client's career site or LinkedIn — what recruiters send to candidates. |
| **Visa / work-auth requirement** | new `Job.workAuthRequirement` | Recommended | E.g. "US Citizen only", "No sponsorship". Today buried in description. Should be a strict filter on candidates. |
| **Skills (structured)** | new `Job.skills String[]` | Recommended | Mirrors `Candidate.skills`. Enables auto-match "candidates that share ≥3 skills with this req." |

**Effort:**
- ~~A1: surface existing nullable columns (positions, reqType, startDate, endDate, durationLabel, department, atsId) in `job-form.tsx` + Zod schema. **S**.~~ ✅ shipped 2026-05-25.
- A2: add two new enums (workMode, priority) + nullable columns (targetCloseDate, postingUrl, workAuthRequirement, skills). Migration + form + filter wiring. **M**.

Both are additive; existing jobs and the iLabor importer keep working unchanged.

## B. Settings & contact management

Echoes user's original notes 1-4 + 5.

1. ~~**Vendor & Client contact records**~~ ✅ **SHIPPED (verified 2026-07-11)** — the `Contact`
   table (tied to `Client | Vendor | SisterCompanySource`, with `name / email / phone / role /
   isPrimary`) + per-settings-tab UI (`contacts-dialog.tsx`) all exist. Vendors have contacts now.
2. **Filter field controls in Settings** (user request #1). What we have is
   "Active vs Inactive" toggles per row; what was asked for is a
   status-based filter on lists / picker dropdowns. Concretely: when picking
   a Client/Vendor/Source on a job form, show active first, optionally
   include inactive. **S** per picker.
3. **Source dropdown free-text "Other" already shipped** — the wording fix
   ("Sister company source" → "Source") was caught and is mostly already
   reflected. Audit remaining labels for stragglers. **S**.
4. ~~Add explicit candidate status reasons: `AVAILABLE / PLACED / NOT_INTERESTED /
   DO_NOT_CONTACT`~~ ✅ **SHIPPED (verified 2026-07-11)** — `CandidateStatus` enum wired into the
   candidate validation + form; drives the submission status gates too.

## C. Pipeline / submission gaps (what big-ATS users expect)

1. 🔴 **No "Offer accepted" intermediate state.** The pipeline jumps from
   `OFFER_RELEASED` → `JOINED`, but in practice candidates often accept the
   offer and only join 2-6 weeks later. Add `OFFER_ACCEPTED` between them.
   Recruiters need the difference to forecast joiners. **M**.
2. 🟡 **No "expected join date" / "actual join date" pair.** Today JOINED
   is binary. For pipeline forecasting, both dates matter. **M**.
3. 🟡 **No bulk status update.** Selecting 10 submissions and marking them
   all rejected is the most-repeated workflow in recruiting; today each is
   a click. **M**.
4. 🟡 **No "duplicate submission" override note.** The duplicate-check
   today blocks; sometimes recruiters re-submit because the role rebooted.
   Capture the override reason in the audit. **S**.
5. ~~**Submitted date not editable in "Update status"** (user note #6).~~
   ✅ addressed — the status form's helper text now links directly to
   `/submissions/[id]/edit` for correcting `submittedAt`. Inline editing
   on the status form intentionally skipped to keep that form focused
   on the status change itself.

## D. Interview rounds (your note #8)

1. **Medium field** — Phone / Video / In-person — add to
   `InterviewRound`. Today recorded as free text in description / feedback.
   **S** (enum + form select + Activity description).
2. **Platform** — Zoom / Teams / Meet / Webex / Other — secondary dropdown
   visible only when medium = Video. **S**.
3. **Meeting link** — URL field (optional). Recruiter pastes the Zoom link
   here; it shows on the interview card and the candidate's timeline. **S**.
4. **Reschedule support** — currently editing a scheduled time just
   silently overwrites. Audit a "rescheduled from X to Y" row. **S**.
5. **Time zone awareness** — `scheduledAt` is naive UTC. Display in user's
   local TZ already works; capture the *interview* TZ as a string so
   schedulers across regions don't ship a Pacific time to a London
   candidate. **M**.

## E. Candidate management (table-stakes missing)

1. 🟡 **Resume parsing.** Modern ATSes auto-extract name/email/phone/skills
   from an uploaded résumé. Big lift, but cuts data-entry by ~70 %. **XL**
   (third-party API: Affinda, Sovren, RChilli — or LLM-based).
2. 🟡 **Tags / labels on candidates.** Distinct from skills — labels like
   "Hot prospect", "On vacation", "Open to relocation". Free-form, per-org.
   **M**.
3. 🟡 **Last-contact tracking.** When did we last email / call this
   candidate? Today there's no way to know — recruiters re-spam silent
   candidates. **M**.
4. 🟡 **Source-of-candidate.** Where did this candidate come from? (LinkedIn
   InMail / referral / job-board / inbound). Reports today only have
   per-job source; per-candidate is more useful for top-of-funnel ROI. **M**.
5. ⚪ **Salary expectations.** Current / desired / negotiation notes.
   Mostly a free-text field today (lives in Notes). **S**.

## F. Reports / analytics gaps

1. 🟡 **Per-source conversion** — see bugs.md (Round 2) item 7. Already
   queued.
2. 🟡 **Time-to-fill** (job created → first joiner) and
   **Time-in-stage** (avg days per pipeline stage). Standard funnel
   metrics; today absent. **L**.
3. 🟡 **Recruiter aging** — "submissions older than 14 days with no
   movement". Surfaces neglected work. **M**.
4. 🟡 **Client / Vendor revenue projection** — (Σ candidateRate × positions
   × duration) per client. Useful for ops. **M**.

## G. Notifications & in-app cues (entirely missing today)

1. 🔴 **No in-app notifications at all.** The minimum: a bell icon with
   "Status of submission X changed", "You were assigned to job Y". Drives
   engagement and stops people from re-loading the dashboard. **XL** (table
   + UI + delivery pipeline).
2. 🟡 **Email digests** (daily / weekly) — same payload as the bell, via
   email. **L** (needs SMTP integration; Resend or SES are the standard
   picks on Vercel).
3. 🟡 **Slack / Teams webhooks** for "new submission" / "candidate joined".
   Most teams already live in Slack. **M** (per-org webhook URL in
   settings).

## H. Search & navigation

1. 🟡 **Saved filters / views.** "All open jobs assigned to me" as a
   one-click pin. Today users build the URL by hand each time. **M**.
2. 🟡 **Recently viewed** strip in topbar (or sidebar). Last 5 jobs +
   last 5 candidates. **S**.
3. 🟡 **Keyboard shortcuts.** `cmd-K` for global search, `g j` to jump to
   Jobs. Tablestakes for power users. **M**.
4. ⚪ **Open in new tab** — most links currently navigate in place;
   middle-click works but cmd-click should too (verify behaviour).

## I. Accessibility & polish

1. ~~🟡 **Focus trap on Dialog**~~ ✅ shipped.
2. ~~🟡 **Keyboard reorder** for the column picker~~ ✅ shipped (↑/↓ buttons in `ColumnsMenu`).
3. ~~🟡 **Empty-state CTAs**~~ ✅ shipped on /candidates + /submissions.
4. ⚪ **High-contrast + dark mode.** Some recruiters work nights. Not
   urgent. **L**.

## J. Trust / audit / compliance

1. 🔴 **PII export / "right to be forgotten" workflow** — when a candidate
   asks to be removed, today an admin would have to delete rows
   manually. Spec a soft-delete with redaction (`name → "Removed"`, contact
   nulled, résumé links scrubbed, but submissions count preserved). **L**.
2. 🟡 **Per-user audit page** — `/recruiters/[id]?tab=activity` already
   shows their actions. Add a global "/audit" admin view across all
   users + filter by action type. **M**.
3. 🟡 **2FA for admins.** Optional TOTP. **L**.
4. ⚪ **Session inspector** — admin sees other active sessions. Useful for
   "I left work without signing out". **M**.

## K. Mobile / responsive (recruiters use phones)

1. 🟡 **Tap targets on the column-picker drag handle** are too small on
   touch (16-px grip icon). Either swap to a "Move up / Move down" pair
   below 768px, or enlarge the hit area. **S**.
2. 🟡 **Sticky table headers** when scrolling long lists on mobile. **S**.
3. 🟡 **Bottom-sheet filter panel** on mobile instead of inline. **M**.
4. ⚪ **Pull-to-refresh** — nice-to-have, mostly handled by the browser.

## Recommended next bundle (~2 hr each, pick one)

**Bundle 1 — "Job fields parity" (manager visibility win):**
A1 (surface existing iLabor columns in manual form) + A2 (workMode +
priority + workAuthRequirement). Single migration, single form rework,
filter additions. ~3 hr total.

**Bundle 2 — "Interview quality" (recruiter friction win):**
D1-D4 (medium + platform + meeting link + reschedule audit). One
migration. ~2 hr.

**Bundle 3 — "Pipeline accuracy" (data-quality win):**
C1 (OFFER_ACCEPTED state) + C2 (expected/actual join date) +
C5 (editable submittedAt). ~3 hr.

**Bundle 4 — "List ergonomics" (cross-cutting):**
H1 (saved filters) + H2 (recently viewed) + I3 (empty-state CTAs).
Pure UI, no schema. ~2 hr.

---

# Round 3.5 follow-ups (2026-05-25 verification pass)

User-flagged after walking through Round 2 — **all shipped 2026-05-25**:

1. ✅ ~~**Dashboard "Active jobs" subtitle is too long to read** —
   currently `Assigned · X open · Y on hold total`. Move the "Assigned"
   qualifier into the tooltip; subtitle becomes `X open · Y on hold`.~~
2. ✅ ~~**Skills column on `/candidates` blows up row height** when a
   candidate has many skills. Hide by default in the column picker
   + cap at 3 chips + `+N` tooltip when shown.~~
3. ✅ ~~**Top-3 "featured" skills on the candidate form.** Star-picker
   chip wall (picked at top, pool below with `+` icons) so the list
   view's truncated badges show *important* skills. Migration
   `20260525000000_candidate_featured_skills` adds
   `Candidate.featuredSkills String[]`.~~
4. ✅ ~~**Candidate detail interview history is a wall of rounds.**
   Replaced with grouped-by-job rows: per-row pips (✓ ✓ ⌛), last-round
   date, native `<details>` expand. New `getCandidateInterviewsGroupedByJob`
   query + `candidate-interviews-grouped.tsx`.~~

Plus, surfaced during implementation:

5. ✅ **Sub-tables paginated at 5 per page** — candidate
   submissions/interviews, job's submitted candidates, recruiter's
   assigned jobs/recent subs. New `SUB_PAGE_SIZE = 5` in
   `src/lib/filters.ts`; `Pagination` gained a `pageSize` prop and
   the "Go to page N" jump now appears at >3 pages (was >7).
6. ✅ **Decimal serialization fix** — `listCandidates` and
   `listSubmissions` now flatten `Decimal` fields
   (`totalExperienceYears`, `candidateRate`) to plain numbers before
   returning, so React 19 doesn't throw "Decimal objects are not
   supported" when the (now Client Component) tables receive them.

Plan file: `~/.claude/plans/yes-lets-go-with-cosmic-clover.md` Phase B.

---

# Pre-demo audit (2026-05-25) — Tier 1 fixes

After Round 3.5 shipped, three review agents (engineering / UX /
recruiter-as-user) read the live code and produced a ranked punch list.
Tier 1 = demo-blocking. **All four code-level items shipped 2026-05-25**:

1. ✅ **Org-entity writes (clients, vendors, sources) gated on admin
   role.** `saveSisterCompany` / `saveVendor` / `saveClient` only
   required `requireUser()` — any recruiter could rename or deactivate
   shared records used across every job. Now requires
   `actor.role === "ADMIN"`. Note: org-entity audit logging is
   intentionally deferred to a later migration — the `Activity` model's
   FK columns and `EntityType` / `ActivityAction` enums have no org
   support today.

2. ✅ **A11y polish bundle** — `Button`/`LinkButton` gained a visible
   `focus-visible:ring-indigo-500` ring via `buttonClass`; the mobile
   navigation drawer adopted a `useFocusTrap` hook extracted from
   `Dialog` (focus capture/return, Tab cycle, Escape close,
   body-scroll lock) and got `role="dialog" aria-modal="true"`; the
   candidate-detail Interview-History `<summary>` gained a focus outline.

3. ✅ **Submission status form pending state.** Wrapped
   `changeSubmissionStatus` in `useTransition`; the Update button now
   disables and relabels "Updating…" mid-flight, killing the
   double-click → duplicate-audit-row demo risk.

4. ✅ **Global search keyboard navigation.** Added ArrowUp/Down/Enter
   with wrap-around plus full combobox ARIA (`role="combobox"`,
   `aria-controls`, `aria-expanded`, `aria-activedescendant`;
   `role="listbox"` on the dropdown, `role="option"` +
   `aria-selected` on each row). Active row highlights at `bg-slate-100`.

5. ✅ **"My work" dashboard scope.** Added `?scope=me|org` URL param
   (default: `me` for recruiters, `org` for admins). When `me`, the
   dashboard forces `filters.recruiterId` to the acting user, so every
   existing KPI and chart focuses on their work. A "My work — needs
   attention" card lists in-flight submissions stale >7 days and
   interview rounds with WAITING/NEED_ANOTHER_ROUND results. New query
   `getMyWork(userId)` in `src/server/queries/dashboard.ts`.

**Skipped** (audit over-aggressive): the "color-only badges fail WCAG"
finding — every status `Badge` already renders its enum label as text,
so color is reinforcement, not the only channel. Not a real
WCAG 1.4.1 failure.

---

# Post-demo polish — 2026-05-25 (round 4)

User-driven fixes after the Tier 1 batch landed. All shipped same day.

1. ✅ **Interview round meeting link** (D3 from Round 3) — nullable
   `InterviewRound.meetingLink` URL column (migration
   `20260525120000_interview_meeting_link`), URL input in the round
   form alongside mode/platform, and a "Join" link surfaced on each
   round card (target=_blank, rel=noopener). Commit `3cd010c`.

2. ✅ **Candidate interview-history layout overhaul.** The expanded
   `<details>` view inside each submission group was a cramped table
   — short header words ("MODE", "INTERVIEWER", "SCHEDULED") collapsed
   to zero gap on wider viewports; long datetimes wrapped to two
   lines and starved every other column. Replaced with per-round
   mini-cards (`<dl>` grid mirroring `interview-rounds-manager.tsx`)
   plus a "Join" Meeting link slot. Commits `7fb4320`, `6888b81`.

3. ✅ **Collapsed group summary row reflow.** The always-visible
   header was one flat `flex-wrap` row with six children, which
   stacked every item onto its own line at narrow widths. Split into
   two intentional clusters: `Job Title · Client Name` on the left,
   `[status badge] [round pips] last-date "See details ▾"` on the
   right. Long titles truncate inside `min-w-0` instead of pushing
   the right cluster off-screen. Commits `6eb97bc`, `03480e5`,
   `fe92f32`, `ea73c31`.

**Tooling note added in CLAUDE.md:** for iterative UI work, install the
official Playwright MCP server (`claude mcp add playwright npx @playwright/mcp@latest`)
so the agent can screenshot rendered pages instead of guessing from CSS.

**Tier 2 / Tier 3** items (workflow + scale): autosave on forms,
"Assign to me" inline, undo on terminal status changes, search
tokenization (ILIKE + AND of tokens), interview reschedule audit,
bulk operations, "Action needed" panel for stale rows, candidate
PDF export, empty-state "Clear filters" CTAs, truncation tooltips on
JobsTable, pagination jump form mobile wrap, org-entity audit logging
(schema migration). All deferred until real-user input lands after
the demo.
