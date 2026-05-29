# Workflow 08 — Reports

> **In plain English.** A wall of analytical tables for the manager
> view: which client/vendor/source/recruiter is producing the most
> submissions, joins, time-to-fill numbers, recruiter aging (work
> sitting too long), and a revenue projection. Slower, deeper
> aggregations than the Dashboard.

**Who uses it:** everyone, but admins are the primary audience.

**Route:** `/reports`.

## Layout

The page is a stack of `Card`s, each containing one table or one
small group of related KPIs. From top to bottom:

1. **Analytics filter bar** — same as Dashboard (date preset +
   client / vendor / source / recruiter).
2. **Performance by client** — submissions, interviews, selected,
   joined, **Joined %**.
3. **Performance by vendor** — same dimensions, grouped by vendor.
4. **Performance by source** — same, grouped by source (sister
   company or "Other").
5. **Performance by recruiter** — same, grouped by recruiter
   (admin-only column).
6. **Open-job aging** — every OPEN/ON_HOLD job, with days-since-created
   bucket. Paginated.
7. **Recruiter aging** (§F3) — every submission >14 days still in an
   early pipeline stage. Highlights work sitting too long.
8. **Client revenue projection** (§F4) — `Σ candidateRate × 8h ×
   duration × positions` for OPEN/ON_HOLD jobs. 90-day default
   duration when start/end dates are missing.
9. **Time to fill** (§F2) — median + p90 days from `Job.createdAt`
   to a JOINED submission, overall + **By client** + **By source**.
10. **Time in stage** (§F2) — median + p90 days each submission
    sits in each non-terminal pipeline status. Walks
    `SUBMISSION_STATUS_CHANGED` audit rows to compute durations.

(Sources of truth: the headers and section IDs map to bugs.md §
references and `src/server/queries/reports.ts`.)

## Every interactive element

- **Filter bar Apply / Clear** — same as Dashboard.
- **Open-job-aging table row** → `/jobs/<id>`.
- **Recruiter-aging table row** → `/submissions/<id>`.
- **Pagination on the long tables** — namespaced param keys per
  table.

## Validation / empty states

Each card shows a polite empty-state ("No submissions in this
window for the selected filters") when the underlying query returns
zero rows.

## Code map

- Page: `src/app/(dashboard)/reports/page.tsx`.
- Queries: `src/server/queries/reports.ts`.
  - `median()`, `percentile()` helpers for time-to-fill / time-in-stage.
  - Dimension aggregators for each "Performance by …" table.
  - `getOpenJobsAging`, `getRecruiterAging`,
    `getClientRevenueProjection`.
- Shared filter helpers: `src/lib/analytics.ts`.
- (Pending tightening: a `CollapsibleTable` exists at
  `src/components/reports/collapsible-table.tsx` for future
  "top 10 + show all" treatment of dimension tables.)

## Why we built it this way

- **Dimension tables are scoring tools.** Recruiters want to skim
  "which client made me most money this quarter" — these tables are
  the answer, with the same columns for visual comparability.
- **Joined % column.** Raw counts hide funnel quality. A vendor
  with 100 subs and 1 join is worse than 20 subs and 4 joins.
  Adding % made that visible.
- **Recruiter aging.** Things slip when nobody surfaces them.
  ">14 days in an early stage" is a tunable, opinionated cutoff.
  When it slips further (>30 days), the entry just stays in the
  table — no decay, no archive — so the team can't ignore it.
- **Revenue projection assumes 8-hour days + 90-day default
  duration.** Honest approximation; the team uses it as a rough
  forecast, not an invoice.
