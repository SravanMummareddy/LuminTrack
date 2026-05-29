# Workflow 02 — Dashboard

> **In plain English.** The home page. A wall of KPI cards, a couple
> of charts, an aging table, and a recruiter scoreboard. Two
> "scopes": **My work** (just your stuff) or **Org-wide** (everything).
> Recruiters default to *My work* at standup; admins default to
> *Org-wide*.

**Who uses it:** everyone (admins get more by default).

**Route:** `/`

## Layout (top → bottom)

1. **Title + scope toggle.** Two tabs: "My work" / "Org-wide".
   Toggling sets `?scope=me|org`. The page text under the title
   switches between "Your work — only submissions and jobs you own"
   and "Org-wide recruiting overview."

2. **My work — needs attention card** (only on `?scope=me`, only
   when there's something to show). Two columns:
   - **Submissions waiting >7 days** — submissions you submitted
     that haven't progressed in the last week.
   - **Interview rounds awaiting result** — rounds with `result =
     WAITING` you own.
   Driven by `getMyWork(userId)` in `src/server/queries/dashboard.ts`.

3. **AnalyticsFilters bar** — date preset (All time / Today / Last 7
   days / Last 30 days / Last 12 months / Custom) + client / vendor /
   source / recruiter dropdowns. `recruiterId` is force-set to you in
   `scope=me`.

4. **KPI cards (8)**:
   - **Active jobs** — OPEN + ON_HOLD with at least one assignment.
     Tooltip: "Counts only OPEN/ON_HOLD jobs with at least one assigned
     recruiter. Unowned bulk-imported jobs are excluded."
   - **Total submissions** — all submissions in the filter window.
   - **Interviews** — total rounds in the window.
   - **Selected**, **Offers released**, **Joined**, **Rejected**,
     **On hold** — count of submissions whose current status is each.

5. **Two donut/bar cards** side by side:
   - **Jobs by status** — donut with a legend listing each status'
     count and a "Total jobs" row.
   - **Jobs by source** — horizontal bars. Top 5 sources kept; the
     rest are folded into "Other" so the chart stays readable.

6. **Submissions by pipeline stage** — wide bar chart (taller, height
   320).

7. **Open-job aging** — four count cards: 0–7d, 8–14d, 15–30d, 30d+.
   Bucket tones in `src/lib/analytics.ts`.

8. **Recruiter performance table** — Submissions / Interviews /
   Selected / Joined per recruiter (admins excluded), with em-dashes
   for zero rows so the table isn't a sea of zeros.

## Every button + what it does

- **Scope tabs ("My work" / "Org-wide")** → query-string toggle, no
  action. Preserves other params.
- **AnalyticsFilters → Apply** → GET form submit, navigates to `/?…`.
- **AnalyticsFilters → Clear** → link to `/` with no params.
- **Recruiter row** (in performance table) → links to
  `/recruiters/<id>`.

## Validation / error / empty states

- Custom date range without dates → "Custom range" preset just shows
  no filter (lib/filters.ts is forgiving).
- Empty dataset for any chart → polite empty-state text inside the
  card.
- Empty recruiter table (when filtered down to nothing) → "No
  recruiter submissions for the selected filters."

## Code map

- Page: `src/app/(dashboard)/page.tsx`.
- Queries:
  - `getDashboardData(filters)` in `src/server/queries/dashboard.ts`
    — does all the parallel aggregations.
  - `getMyWork(userId)` — only called in `?scope=me`.
- Filter parsing: `parseAnalyticsParams` in `src/lib/analytics.ts`
  (plus `TONE_HEX`, `AGING_BUCKET_LABEL`, `AGING_BUCKET_TONE`).
- Charts: `BarChartCard`, `DonutChartCard` in
  `src/components/dashboard/charts.tsx`.
- KPI cards: `StatCard` in `src/components/dashboard/stat-card.tsx`.

## Why we built it this way

- **Scope toggle.** Originally the Dashboard was org-wide for
  everyone, and recruiters complained that they had to filter to
  themselves every morning. Adding `?scope=me` (defaulted by role)
  fixed it without removing the org view admins use.
- **Top-5 source bucket.** The "Jobs by source" chart kept growing
  unreadable with a long tail of one-off sources. Top-5 + "Other"
  keeps the chart skim-able.
- **Tooltips on KPI cards.** A few of the cards have non-obvious
  definitions ("Active jobs" excludes unowned bulk imports). The
  tooltip is the single source of truth for what each number means.
- **Em-dashes for zero rows.** A recruiter on PTO showed up as a
  row of zeros. The em-dash makes the visual scan faster — your eye
  jumps to who actually did work.
