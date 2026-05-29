# 01 — React Server Components (RSC)

> **In plain English.** A React component that runs *only on the
> server*. It can read from the database directly, never ships its
> JavaScript to the browser, and renders HTML the browser displays.
> If a component needs to be interactive (button clicks, form state,
> animations) you mark it as a Client Component with `"use client";`
> at the top. LuminTrack is mostly Server Components — only the
> tables, dialogs, and forms are client-side.

## The technical core

A React tree is now split into two kinds of components:

- **Server Component (default in App Router).** Runs on the server.
  Can be `async`. Can `await` a Prisma query, `await cookies()`, etc.
  Its source code is **not** sent to the browser. Its *output*
  (serialized React tree) is.
- **Client Component (opt-in via `"use client";`).** Runs in the
  browser. Can use `useState`, `useEffect`, event handlers. Hydrates
  the HTML the server produced.

The compiler walks the tree. Wherever it sees `"use client";`, that
component (and anything inside its tree) becomes part of the
browser bundle. Server Components above the `"use client"` boundary
stay on the server.

A Server Component can **render** a Client Component (passing
serializable props). The reverse is also possible via `children`,
but a Client Component cannot *import* a Server Component directly.

### Why it matters

- **Bundle size.** Data-shaping logic, Prisma, date-fns formatting —
  none of it ships to the browser.
- **No data-fetching waterfall.** A Server Component can `await`
  three queries in parallel before returning JSX. No `useEffect`
  → fetch → setState dance.
- **Direct DB access.** No API layer needed in between.
- **Type safety from DB to JSX.** The same TypeScript type flows.

### What you give up

- Server Components can't use state, effects, or browser APIs.
- The boundary requires thinking — you must decide which components
  need interactivity.
- Streaming and Suspense require care (see
  [`03-hydration-and-suspense.md`](./03-hydration-and-suspense.md)).

## Where it lives in LuminTrack

- **Server Components (default):**
  `src/app/(dashboard)/jobs/page.tsx`,
  `src/app/(dashboard)/candidates/[id]/page.tsx`, and basically
  every `page.tsx`. They `await` queries from
  `src/server/queries/*.ts` and render.
- **Client Components (`"use client";`):**
  `src/components/jobs/jobs-table.tsx`,
  `src/components/ui/dialog.tsx`,
  `src/components/ui/pagination.tsx`,
  `src/components/search/global-search.tsx`,
  `src/components/timeline/*`.
  Anything with `useState` / `useEffect` / drag-drop / debounce.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "LuminTrack is built on Next.js 16's App Router, so pages default
> to Server Components. The jobs list page, for example, is an
> async function that awaits `listJobs(filters)` directly — Prisma
> runs server-side, the page renders to HTML, and only the *table*
> below it is a Client Component because it has the column-picker
> dropdown and sortable headers. That means the Prisma client,
> the date formatters, and the row-shaping logic never ship to the
> browser. The bundle is small and the first paint is fast.
> Interactivity is opt-in: I add `"use client";` only where I need
> state or event handlers."

**Expect these follow-ups:**

- "When would you NOT use a Server Component?" → If the component
  needs `useState`/`useEffect`, browser APIs (localStorage, the
  DOM), real-time interactivity, or third-party client-only libs.
- "How does data flow from Server to Client?" → Props. Server
  renders, passes serializable values; React serializes the tree;
  Client hydrates. Non-serializable values (Date is fine; functions,
  class instances, Prisma `Decimal`) need flattening.
- "What's a hydration error?" → See
  [`03-hydration-and-suspense.md`](./03-hydration-and-suspense.md).

## Mistakes to avoid saying

- ❌ "Server Components are like SSR." They're related but not the
  same. SSR renders Client Components to HTML; RSC keeps the
  component *itself* on the server.
- ❌ "Server Components are faster." Faster *first paint* is the
  honest claim. They're not always faster end-to-end.
- ❌ "I always use Server Components." You can't — anything with
  state has to be Client.
- ❌ "A Client Component can't import a Server Component." It can
  *receive* one via `children`, just not `import` one.

## Go deeper

- React docs: [Server Components](https://react.dev/reference/rsc/server-components).
- Next.js docs: [Composition patterns](https://nextjs.org/docs/app/getting-started/server-and-client-components).
- Dan Abramov on RSC mental model — search "Dan Abramov RSC explainer."
