# Workflow 09 — Audit page (admin)

> **In plain English.** The "what did the team do, system-wide?"
> page. Same audit log as the timeline that shows on each detail
> page, just unfiltered by entity and filterable by action + user +
> date. Admin-only.

**Who uses it:** admins.

**Route:** `/audit`. Non-admins see `<Forbidden />`.

## Layout

- Page header: "Audit log."
- Filter row: **Action** (multi), **User** (single), **Entity type**
  (Job / Candidate / Submission / Round), **Date range** (preset or
  custom).
- Table: 25 rows per page, reverse-chronological.
  Columns: When · Who · Action · Entity (linked) · Description ·
  Reason (when set).

## Every button + what it does

- **Apply filters** → GET form submit.
- **Clear** → link to `/audit`.
- **Entity link** → `/jobs/<id>` / `/candidates/<id>` /
  `/submissions/<id>`.
- **User link** → `/recruiters/<id>` (admin's own entry links there
  too).
- **Pagination** → numbered + Prev/Next + "Go to page".

## Code map

- Page: `src/app/(dashboard)/audit/page.tsx`.
- Query helper: see `src/server/queries/timeline.ts` (or the
  audit-specific helper alongside it).
- Filter parsing: same `parseDateRange` / `parsePage` helpers.

## Why admin-only

- Recruiters already see the per-entity timeline on every detail
  page. They don't need an org-wide feed.
- The audit log is a compliance/oversight tool. Admins are the
  audience for "who deleted that round at 11pm?".

## Why we built it this way

- Linked from Settings → "Admin tools" so it's not in the main nav.
  Saves nav real-estate for the recruiter-facing pages.
- Filters are GET form params (URL is the source of truth) so an
  audit query can be shared as a link with another admin.
- Page size 25 (vs the list pages' 10) because audit rows are
  smaller per-row and admins are typically skimming.
