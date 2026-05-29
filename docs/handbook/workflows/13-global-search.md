# Workflow 13 — Global search

> **In plain English.** The search box in the topbar. Type anything
> and you get a typeahead dropdown of matching candidates, jobs,
> clients, vendors, sources, and recruiters. Hit Enter to jump to
> the first result; ↑/↓ to navigate; click to open.

**Who uses it:** everyone.

**Where:** topbar — present on every authenticated page.

## What it searches

`src/server/queries/search.ts` (`globalSearch(q)`) fans out 6
parallel queries:

| Entity         | Matches                                                            |
|----------------|--------------------------------------------------------------------|
| Candidate      | fullName, email, currentCompany, currentLocation, skills, display ID (CAND-001, or bare seq). |
| Job            | title, location, portalRefId, display ID (JOB-00123 / REQ-…).      |
| Client         | name.                                                              |
| Vendor         | name.                                                              |
| SisterCompanySource | name.                                                         |
| User (recruiter) | fullName, email.                                                |

Substring match is case-insensitive (`contains` with
`mode: "insensitive"`). Org entities have no detail page so they
link to `/jobs?clientId=…` etc.

## UX

- **Debounce** 250ms after typing stops.
- **Minimum 2 chars** to fire a query (avoids floods of single-letter
  searches).
- **Stale-response guard** — each response is tagged with the query
  it belongs to; an older response is discarded if a newer one
  arrived first.
- **Keyboard nav** — ↑ / ↓ moves the highlighted row; Enter opens
  it; Esc closes the dropdown.
- **ARIA combobox roles** — `aria-haspopup="listbox"` /
  `aria-expanded` / `aria-activedescendant` so screen readers
  announce the active option.
- Grouped results by type with a small label header in the dropdown.

## Code map

- Component: `src/components/search/global-search.tsx`.
- API endpoint: `src/app/api/search/route.ts` (a thin wrapper that
  calls `globalSearch`).
- Query: `src/server/queries/search.ts`.
- Shared types: `src/lib/search-types.ts`.

## Why an API route here

This is the *only* API route in the app. Everything else uses
Server Components for reads and Server Actions for writes. The
search dropdown is purely interactive (Client Component) and needs
a request-per-keystroke style endpoint — easier as a route handler
than as a Server Action that returns JSON.

## Why we built it this way

- **Display IDs searchable.** Recruiters reference jobs/candidates
  by their human ID in chat ("look at JOB-00123"). The parser pulls
  the numeric tail and matches `seq`.
- **Substring, not full-text.** The dataset is small (thousands, not
  millions). A real full-text index (Postgres `tsvector`) would
  out-engineer the current scale.
- **No backend caching.** Each query hits Postgres. Cheap enough at
  this size; we'd add caching if/when the dataset grows.
- **Org entities link to filtered lists.** A client doesn't have its
  own detail page; opening a client search result lands you on the
  Jobs list filtered to that client — the natural next click.
