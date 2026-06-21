# 06 — Conventions

> **In plain English.** This doc is the rule book. Every file in the
> repo follows it. If you find yourself fighting one of these rules,
> you're probably solving the wrong problem — stop and ask before
> bending it.

## The folder layout

```
src/
  app/
    (auth)/                  ← public routes (login, etc.) — separate layout
    (dashboard)/             ← every authenticated route — shared topbar/sidenav
      dashboard/  jobs/  candidates/  submissions/
      recruiters/  reports/  settings/  audit/
      layout.tsx   page.tsx   error.tsx   not-found.tsx
    api/                     ← any non-Action route handlers (rare)
  components/
    ui/                      ← generic primitives (Table, Dialog, Pagination, …)
    <feature>/               ← feature-scoped components (jobs/, candidates/, …)
    layout/                  ← topbar, sidenav, mobile nav, user menu
  lib/
    validation/              ← Zod schemas (one file per resource)
    session.ts auth-token.ts password.ts  ← auth bits
    filters.ts format.ts labels.ts cn.ts  ← shared helpers
    use-column-prefs.ts  use-focus-trap.ts ← reusable hooks
  server/
    actions/                 ← Server Actions (mutations)
    queries/                 ← typed read functions for Server Components
    db.ts                    ← Prisma singleton + Neon adapter
    activity.ts              ← logActivity() helper
  generated/prisma/          ← Prisma client output (gitignored)
prisma/
  schema.prisma
  migrations/                ← timestamped dirs, each with migration.sql
  seed.ts seed-demo.ts
```

## The four big rules

### Rule 1 — Reads in `queries/`, writes in `actions/`

- A page (Server Component) calls a function from
  `src/server/queries/*.ts` to load its data.
- A form (Client or Server) calls a Server Action from
  `src/server/actions/*.ts` to mutate.

There is no `// inline DB call inside a component` shortcut. Even if
it's "just one row", route it through the right file.

### Rule 2 — Every mutation is audited atomically

This is the single most-important invariant in the codebase:

```ts
// src/server/actions/jobs.ts (excerpt — every action looks like this)
await prisma.$transaction(async (tx) => {
  const created = await tx.job.create({ data: { … } });
  await logActivity(tx, {
    action: "JOB_CREATED",
    entityType: "JOB",
    entityId: created.id,
    actorId: user.id,
  });
  return created;
});
```

`logActivity` (in `src/server/activity.ts`) writes an `Activity` row.
By passing the same transaction client `tx` to both writes, we
guarantee that **either both happen or neither does** — you can never
have a Job that was created without an audit row.

If you write a new mutation and skip the audit row, code review will
bounce it. Full doc: [`09-audit-and-timeline.md`](./09-audit-and-timeline.md).

### Rule 3 — Validation is the same schema on both sides

A Zod schema in `src/lib/validation/<resource>.ts` is used by:

1. The client form (via `@hookform/resolvers/zod`) for live errors.
2. The Server Action, which re-runs `schema.safeParse(formData)` —
   never trust the client.

If a field needs a new constraint, edit the Zod schema. Both sides
update for free.

### Rule 4 — No hard deletes for primary entities

- **Jobs, Candidates, Submissions** — never deleted. Retire via
  status (`JobStatus.CLOSED`, `Candidate.isActive = false`, etc.).
- **Org entities (Client, Vendor, Source)** — deactivated via
  `isActive = false`. Old records still reference them.
- **Notes, Rounds** — *can* be hard-deleted (small, low-value data;
  deletes are audited).
- **Résumés** — soft-deleted via `CandidateResume.isActive` (archive),
  because a Submission keeps a live FK to the résumé it used. A true
  hard delete is allowed only for a résumé with no submissions.

This means the audit trail is always complete.

## Sub-conventions

### Display IDs

Users see `JOB-00123`, `REQ-159263`, `CAND-001`, `SUB-001` — not UUIDs.
Each of Job / Candidate / Submission has an extra
`seq Int @unique @default(autoincrement())` column. Formatters in
`src/lib/format.ts` turn the integer into the padded string. Full doc:
[`10-imports-and-display-ids.md`](./10-imports-and-display-ids.md).

### URL is the source of truth for list state

`/jobs?status=OPEN&sort=created&dir=desc&page=2` — every filter, sort
direction, page number lives in the query string. We use
`src/lib/filters.ts` (`parseSort`, `parsePage`, etc.) on the server
to read them. No client-side filter state, no Redux.

Benefits: deep-linkable, shareable, refresh-safe, no hydration
mismatch.

### Pagination has 10-row pages

The shared `Pagination` component (`src/components/ui/pagination.tsx`)
defaults to 10 rows per page. Sub-tables (e.g. submissions on a Job
detail page) override to `SUB_PAGE_SIZE = 5` and namespace the param
(`?subs=2` instead of `?page=2`).

### Sorting uses a whitelist on the server

Each query file exports a `<RESOURCE>_SORTS` map of allowed sort
keys. Any value outside the whitelist falls back to the default. The
client cannot inject an arbitrary `ORDER BY`.

### Filters use `FilterBar`

`src/components/ui/filter-bar.tsx` is a collapsible filter container
that wraps a `<form method="GET">`. Filters submit via the URL (see
above). It renders an active-filter count badge so users know the
list is filtered.

### Form state pattern

We use React 19's form-action API. The action signature is:

```ts
type FormState = { error?: string; fieldErrors?: Record<string, string>; success?: boolean };
export async function createJob(_prev: FormState, formData: FormData): Promise<FormState> { … }
```

Client component uses `useActionState(createJob, {})` and renders
`fieldErrors[name]` next to inputs. The action redirects on success
via `redirect()`.

### Labels in `src/lib/labels.ts`

Enums (e.g. `JobStatus.OPEN`) have presentation strings ("Open"),
tones for the Badge component ("emerald"), and option ordering for
dropdowns. All centralised in `src/lib/labels.ts`. UI never imports
the raw enum string.

### Naming

- File names: kebab-case (`candidates-table.tsx`).
- Components: PascalCase exports.
- Hooks: `useThing`, in `src/lib/use-thing.ts`.
- Server Actions: verbNoun (`createJob`, `updateSubmissionStatus`).
- Queries: `getX` (single), `listX` (multiple), `searchX` (search).

### Comments

We are stingy with comments. Names should do the work. When we *do*
write a comment, it explains the *why*, not the *what* — usually a
non-obvious constraint, a workaround for a specific bug, or
behaviour that would surprise a reader.

## How to add a new feature

A typical "add a field to Job" change touches:

1. `prisma/schema.prisma` — add the column.
2. `npm run db:migrate` — generate the migration.
3. `src/lib/validation/job.ts` — add the Zod field.
4. `src/components/jobs/job-form.tsx` — add the input.
5. `src/server/actions/jobs.ts` — read it from `FormData`, write to DB.
6. `src/server/queries/jobs.ts` — include it in the return shape if
   the list needs it.
7. (Optional) `src/components/jobs/jobs-table.tsx` — render as a new
   column with a default-visibility flag.

Six files for one field. The repetition is the cost of full type
safety and the validation-on-both-sides rule. Embrace it.
