# 03 — Architecture

> **In plain English.** This doc explains *how a single page load
> works* and *how a button click changes the database*. Once you've
> read it, every file in `src/server/` and `src/app/` should make
> sense.

## The 4-layer mental model

```
┌────────────────────────────────────────────────────────────────┐
│  Browser                                                       │
│  ─ Client Components ("use client") for interactive bits       │
│  ─ Server Components (default) rendered to HTML on the server  │
└────────────────────────────────────────────────────────────────┘
                       │  cookies, FormData, URL params
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  proxy.ts (was middleware)                                     │
│  ─ Auth gate: redirect to /login if no session cookie          │
└────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Server                                                        │
│  ─ src/app/(dashboard)/<route>/page.tsx  ← reads via queries/  │
│  ─ src/server/actions/*.ts               ← writes              │
│  ─ src/server/queries/*.ts               ← reads               │
└────────────────────────────────────────────────────────────────┘
                       │  Prisma + driver adapter
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  PostgreSQL (Neon)                                             │
└────────────────────────────────────────────────────────────────┘
```

## Request lifecycle — a real page load

User visits `GET /jobs?status=OPEN&page=2`.

1. **Proxy.** `src/proxy.ts` runs. It reads the
   `lumintrack_session` cookie, verifies the JWT
   (`verifySessionToken` in `src/lib/auth-token.ts`). If invalid,
   redirect to `/login`. Otherwise, continue.
2. **Route resolution.** Next.js maps `/jobs` to
   `src/app/(dashboard)/jobs/page.tsx`. The `(dashboard)` group
   shares a layout that renders the topbar + sidenav.
3. **Server Component renders.** The page is `async`. It:
   - `await`s `searchParams` (Next 16 made these async).
   - Calls `parseSort()`, `parsePage()`, `parseStatusFilter()` from
     `src/lib/filters.ts` to turn URL params into typed values.
   - Calls `listJobs({ status, sort, page })` from
     `src/server/queries/jobs.ts`.
4. **Query runs.** `listJobs` builds a Prisma query, runs it through
   the singleton `prisma` (Neon adapter), returns
   `{ rows, total, page }`.
5. **Render to HTML.** The Server Component renders the page,
   including the `<JobsTable>` Client Component with the rows passed
   as props.
6. **Stream to browser.** React 19 streams the HTML chunk-by-chunk.
   Client Components hydrate where needed.

The Server Component code never ships to the browser. Only the
Client Components do. This is why list pages have fast first paint
and small JS bundles.

## Mutation lifecycle — a real button click

User clicks "Update status → SELECTED" on a submission.

1. **Form submission.** The `<form action={updateSubmissionStatus}>`
   on the submission detail page is React 19's form-action binding.
   `updateSubmissionStatus` is a Server Action (`"use server"` at the
   top of `src/server/actions/submissions.ts`).
2. **POST to the server.** The browser POSTs the form encoded with
   metadata identifying the action. Next.js routes it to the
   function.
3. **Action runs server-side.** Inside the action:
   - `await requireUser()` — pulls the current user from the cookie.
     Redirects to `/login` if missing.
   - `schema.safeParse(formData)` — re-validates with the same Zod
     schema the client used. Server never trusts the client.
   - `prisma.$transaction(async (tx) => { … })` — does the write *and*
     `logActivity(tx, …)` for the audit row.
4. **Cache invalidation.** Action calls `revalidatePath("/submissions")`
   so the list page re-fetches on next view.
5. **Redirect or return.** Most actions either:
   - `redirect("/submissions/abc")` — go to the detail page, or
   - return `FormState` (`{ error?, fieldErrors?, success? }`) which
     the form renders inline.

The Server Action protocol is special: the body executes only on the
server, but the function reference *is callable from Client
Components* because Next replaces the call site with an RPC.

## File-by-file map

```
src/app/(dashboard)/jobs/page.tsx
  └─ imports queries/jobs.ts:listJobs
  └─ renders <JobsTable rows=… />          ← Client Component

src/components/jobs/job-form.tsx           ← Client Component
  └─ form action={createJob from actions/jobs.ts}

src/server/actions/jobs.ts                 ← "use server"
  └─ validates with lib/validation/job.ts
  └─ writes via $transaction(tx)
  └─ logActivity(tx, …)
  └─ revalidatePath(…)  +  redirect(…)

src/server/queries/jobs.ts                 ← regular .ts (no directive)
  └─ pure read functions returning typed shapes

src/server/db.ts                           ← prisma singleton + Neon adapter
src/server/activity.ts                     ← logActivity helper
```

## Why Server Components by default?

- **No waterfall.** A page can fan out three queries in parallel
  without `useEffect`-then-fetch.
- **Smaller bundles.** Data shaping code never ships to the browser.
- **Direct DB access.** Queries call Prisma directly; no API layer to
  invent.
- **Type-safety from DB to JSX.** The shape `listJobs` returns is the
  shape the table component consumes. Rename a column in Prisma →
  TypeScript flags every consumer.

When a component needs interactivity (state, effects, event handlers)
we add `"use client";` at the top. The mental model: "use client" is
opt-in for *islands of interactivity*.

## The audit invariant (worth its own section)

```ts
await prisma.$transaction(async (tx) => {
  const created = await tx.job.create({ data: …  });
  await logActivity(tx, {
    entityType: "JOB",
    action: "JOB_CREATED",
    jobId: created.id,
    performedById: user.id,
    description: `Created job "${created.title}"`,
  });
});
```

The transaction client `tx` is passed to both. Postgres treats the
two writes as one unit. Either:

- Both succeed → audit row exists for the change. ✅
- Both fail → no change, no orphan audit row. ✅
- One succeeds, one fails → **impossible.**

This is the only way the audit log can be trusted. Skipping
`logActivity` is a code-review block.

Full details: [`09-audit-and-timeline.md`](./09-audit-and-timeline.md).

## Where shared utilities live

- `src/lib/session.ts` — `getCurrentUser` (React-cached per request),
  `requireUser`, `createSession`, `destroySession`.
- `src/lib/filters.ts` — `parseSort`, `parsePage`, `parseDateRange`,
  filter helpers.
- `src/lib/format.ts` — `formatDate`, `formatJobDisplayId`,
  `formatCandidateDisplayId`, `formatSubmissionDisplayId`,
  `formatExperience`.
- `src/lib/labels.ts` — enum → display string + tone maps for the
  Badge component.
- `src/lib/cn.ts` — the classic `cn(...classes)` helper for Tailwind
  composition. Backed by `tailwind-merge`, so conflicting utilities
  resolve last-wins (a caller's `text-amber-700` overrides a component's
  baked-in `text-slate-700`) — added after a plain string-join silently
  defeated passed colours.

## The "no API routes" decision

The app has essentially no `src/app/api/*` routes. Server Actions
cover every mutation. Queries cover every read. The only exception
is icon/manifest routes that Next auto-generates from
`src/app/icon.tsx` and friends, which are bypassed in `proxy.ts`'s
`ASSET_PATHS`.

If we ever need a webhook receiver (incoming POST from a third
party), it'll live in `src/app/api/<thing>/route.ts`. We don't have
any yet.
