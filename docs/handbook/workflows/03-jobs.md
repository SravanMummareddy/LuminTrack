# Workflow 03 — Jobs

> **In plain English.** Jobs are the requirements. This is where a
> recruiter goes to see what's open, create a new one (manual), or
> drill into a single job's pipeline. Admins additionally see the
> bulk-import wizard.

**Who uses it:** everyone (admins additionally have import).

## The list page (`/jobs`)

**What you see.**

- Page header: "Jobs" + a "Create job" primary button (right side).
- Source sub-tabs (`?source=ilabor` / `?source=manual` / all) above
  the list. Counts shown next to each tab.
- FilterBar: status, client, vendor, source, recruiter, date range,
  text search.
- Jobs table: paginated 10/page; sortable columns; column show/hide
  via the **Columns** menu.

**Default columns visible.** S.No · Job ID · Job title · Client ·
Vendor · Source · Location · Recruiters · Status · Subs · Created.

**Hidden-by-default (iLabor) columns.** Req ID · iLabor status ·
Projected start · Last imported. Toggle in the Columns menu.

**Every interactive element**

- **Create job** → `/jobs/new`.
- **Source tab** → query-string `?source=…`.
- **Columns menu** → show/hide + reorder; persisted in localStorage.
- **Sort header** → toggles `?sort=` / `?dir=`. Active column gets
  an arrow.
- **Row** → click anywhere on the card (mobile) or the title link
  (desktop) → `/jobs/<id>`.
- **Pagination** → numbered links, "Go to page" input when > 7
  pages.

**Code map.**

- Page: `src/app/(dashboard)/jobs/page.tsx`.
- Table: `src/components/jobs/jobs-table.tsx`.
- Filters bar: `src/components/jobs/job-filters.tsx`.
- Source tabs: `src/components/jobs/job-source-tabs.tsx`.
- Query: `listJobs(filters, paging)` in `src/server/queries/jobs.ts`
  + the `JOB_SORTS` whitelist.

## Create / edit job (`/jobs/new`, `/jobs/<id>/edit`)

**The form.** Two visible sections plus a collapsible "More job
details" for the iLabor-parity fields:

- Required: Title, Client, Vendor, Source (one of: managed sister
  company OR "Other" + free text), Status.
- Optional: Location, Vendor rate, Candidate rate, Description,
  Notes, Recruiters (multi-select).
- LuminTrack-native planning: Work mode, Priority, Target close
  date, Posting URL, Work auth, Skills (comma-separated).
- iLabor-parity (under "More job details"): Positions, Req type,
  Department, Duration label, ATS id, Start date, End date.

**Every button + what it does**

- **Save** → `createJob` (or `updateJob`) action. On success,
  redirects to `/jobs/<id>`.
- **Cancel** → link back to `/jobs`.

**Validation** — see `jobSchema` in `src/lib/validation/job.ts`. Notable
rules:
- Source must be set (either a managed source id or "Other" + a
  `sourceOther` value).
- Rates must be non-negative.
- Title 1–200 chars.

**Audit row written.**

- Create: `JOB_CREATED`.
- Update: `JOB_UPDATED`.
- Recruiter assignment changes: `RECRUITER_ASSIGNED` /
  `RECRUITER_UNASSIGNED` (one per change).

## Job detail (`/jobs/<id>`)

**Layout.**

- Page header with the Job title, status badge, display ID, and an
  "Edit" link (right side, admin/owner).
- A summary card with: client, vendor, source, rates, location,
  recruiters, key dates.
- An **iLabor card** if `portalId` is set — read-only iLabor data
  (Req ID, iLabor status, owner, ATS id, positions, etc.) + a "Last
  imported" timestamp.
- **Submissions sub-table** — every candidate submitted to this job,
  paginated 5/page (`?subs=`).
- **Activity timeline** — collapsible feed of every audit row that
  touches this job, its submissions, and their rounds.
- **Notes** — attach a free-text note to the job.

**Every interactive element**

- **Edit** → `/jobs/<id>/edit`.
- **Change status** (admin) → quick action that flips
  `JobStatus`. Writes `JOB_UPDATED` with old/new value.
- **Submit candidate** button → `/submissions/new?jobId=<id>` (the
  job is pre-selected).
- **Sub-table row** → `/submissions/<id>`.
- **Add note** → posts to `createNote` action; writes
  `NOTE_ADDED`.

**Code map.**

- Page: `src/app/(dashboard)/jobs/[id]/page.tsx`.
- Queries: `getJob(id)` in `src/server/queries/jobs.ts`,
  `getTimelineFor("JOB", id)` in `src/server/queries/timeline.ts`.

## Import (admin only)

See [`workflows/12-ilabor-import.md`](./12-ilabor-import.md).

## Why we built it this way

- **Source sub-tabs.** iLabor imports flood the list with hundreds
  of rows. Sub-tabs let recruiters see *only* the manual jobs they
  care about, while keeping imports available with one click.
- **Column show/hide.** The iLabor-parity columns are dead weight
  for manual recruiters; the manual columns are noise for the
  admin reviewing imports. Letting each user toggle solves both.
- **"More job details" collapsible.** The form was overwhelming
  with all the iLabor-parity fields visible. Hiding them under a
  toggle keeps the common case clean.
- **Status preserved on re-import.** Recruiters routinely hand-edit
  a job's status (e.g. mark FILLED before iLabor updates). The
  importer respects that — see
  [`10-imports-and-display-ids.md`](../10-imports-and-display-ids.md).
