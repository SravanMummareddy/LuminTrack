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

## 🔴 Correctness

1. **Candidate detail "Job" column links to `/submissions/{id}` instead of `/jobs/{job.id}`** —
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

8. **Candidate + Submission lists have no column picker.** Jobs has the full
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

- StatCard tooltips clarifying "what filters are applied."
- "Jobs by source" chart: cap at top-5 + "Other" bucket. `src/server/queries/dashboard.ts` ~L57.
- Recruiter-detail "Submissions" table needs sortable columns / status filter.
- Skills field: "Separate with commas" hint. `src/components/candidates/candidate-form.tsx`.
- Submission-edit form: `submittedAt` input not marked `required`.
- Settings user form: a checkbox label missing `htmlFor`. `src/components/settings/user-section.tsx` ~L209.
- Default recruiter assignment on new jobs: optional but unclear — add help text or make required.

## Recommended bundle (~90 min)

Items **1, 2, 4, 6, 9, 11** in one PR — covers the highest-value correctness
items + two clear UX gaps without dragging in a11y or column-picker port.
