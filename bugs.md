1. in settings there is no filter option for the avilable fields - mostly care about status
2. need to add client contacts in setting in setting tab and similarly for vendors - name email and phone and location if possible
3. source in jobs need not come from a dropdown list of sister companies - so we need to provide option to enter manualy as well, like sister company others, if others is selected we can manually enter the source
4. also change the name from sister company source to just source.
5. once candidate is moved from our company how to track it, should we also include active - inactive status for candidates?
6. submitted date we are not able to update in update status.
7. by deafult show present date and time in when this happened field - currently it is showing empty.
8. we need to add one more field in interview round, - video, just phone call, in person interview? - teams, google meet etc - could be dropdown.

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
11. **No visual warning when LuminTrack `status` differs from iLabor
    `externalStatusRaw`.** Recruiters silently miss drift after a re-import.
    Small amber badge on `/jobs/[id]`. **M**.
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
- Skills field: "Separate with commas" hint. `src/components/candidates/candidate-form.tsx`.
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

1. **Vendor & Client contact records** (currently only Clients have contact
   sub-records — and only one). Spec out a `Contact` table tied to
   `Client | Vendor | SisterCompanySource` with `name / email / phone /
   role / isPrimary` and a UI under each settings tab. **M**.
2. **Filter field controls in Settings** (user request #1). What we have is
   "Active vs Inactive" toggles per row; what was asked for is a
   status-based filter on lists / picker dropdowns. Concretely: when picking
   a Client/Vendor/Source on a job form, show active first, optionally
   include inactive. **S** per picker.
3. **Source dropdown free-text "Other" already shipped** — the wording fix
   ("Sister company source" → "Source") was caught and is mostly already
   reflected. Audit remaining labels for stragglers. **S**.
4. **Candidate Active flag** already exists (Badge on candidate detail).
   Add explicit status reasons: `AVAILABLE / PLACED / NOT_INTERESTED /
   DO_NOT_CONTACT` — more useful than a single boolean for recruiters
   filtering for re-engagement. **M**.

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
5. 🟡 **Submitted date not editable in "Update status"** (user note #6).
   Schema already supports it; just add a controlled input to the form.
   **S**.

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

User-flagged after walking through Round 2:

1. 🟡 **Dashboard "Active jobs" subtitle is too long to read** —
   currently `Assigned · X open · Y on hold total`. Move the "Assigned"
   qualifier into the tooltip; subtitle becomes `X open · Y on hold`.
   `src/app/(dashboard)/page.tsx`. **S**.
2. 🟡 **Skills column on `/candidates` blows up row height** when a
   candidate has many skills. Plan: hide by default in the column picker
   + cap at 3 chips + `+N` tooltip when shown.
   `src/components/candidates/candidates-table.tsx`. **S**.
3. 🟡 **Top-3 "featured" skills on the candidate form.** Add a chip
   star-picker so the list view's truncated badges show *important*
   skills, not arbitrary first-three. Needs migration:
   `Candidate.featuredSkills String[]`. **M**.
4. 🟡 **Candidate detail interview history is a wall of rounds.**
   Replace one-row-per-round with grouped-by-job: per-row pips
   (✓ ✓ ⌛), last-round date, native `<details>` expand for full
   round breakdown. New query in `src/server/queries/interviews.ts`,
   new component, swap rendering on `/candidates/[id]`. **M**.

Plan file: `~/.claude/plans/yes-lets-go-with-cosmic-clover.md` Phase B.
