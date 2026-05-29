# Workflow 10 — Recruiters

> **In plain English.** The team roster + a per-recruiter scoreboard
> showing their open work, recent submissions, and outcomes. Admins
> can also create / deactivate recruiters from here.

**Who uses it:** everyone (admins additionally see admin actions).

## The list page (`/recruiters`)

**What you see.**

- Page header + (admin only) "Add recruiter" button.
- Recruiter cards / rows showing: full name, email, role badge,
  active flag, and a few rolled-up counters (submissions this
  month, joined this month, etc.).
- Admins are **excluded** from this list (the page is about
  recruiter performance, not "the boss").

## Recruiter detail (`/recruiters/<id>`)

**Layout.**

- Header: name, role, active flag, "Edit" / "Deactivate"
  (admin-only).
- KPI strip: total submissions, interviews, selected, joined,
  rejected, on hold.
- **Status pill filter** — clickable badges that filter the
  submissions table below to a single status (uses `?rstatus=`).
- **Jobs they're assigned to** (`?jobs=`).
- **Their submissions** (`?rsubs=`) — paginated 5/page.
- **Recent status changes they made** — slice of the audit log.

**Every interactive element**

- **Status pill** → toggles `?rstatus=…`.
- **Sub-table row** → respective detail page.
- **Pagination** for each sub-table — namespaced params.
- **Edit / Deactivate** (admin) → `updateUser` action.

## Code map

- List page: `src/app/(dashboard)/recruiters/page.tsx`.
- Detail page: `src/app/(dashboard)/recruiters/[id]/page.tsx`.
- Query: `src/server/queries/recruiters.ts`.
- Action: `src/server/actions/users.ts`.

## Why we built it this way

- **Admins excluded from the list.** A 10-person team with 1 admin
  produced a "wat" moment when the admin showed up with 0
  submissions. Hiding them keeps the list a clean recruiter
  scoreboard.
- **Status pill filter on the detail.** Recruiters complained that
  the "Recent submissions" table was hard to scan when the same
  recruiter had 200 entries; pill-filtering by status (Submitted /
  Joined / On hold) makes it tractable.
- **Namespaced sub-table params.** Two paginated sub-tables on the
  same page can't both use `?page=`. Each gets its own key.
