# 02 — The tech stack

> **In plain English.** Every library and tool we use, what it does,
> and *why we picked it over the obvious alternative*. If you've
> worked with older Next.js or Prisma versions, read the "gotchas"
> column — most of the surprises live there.

## At a glance

| Layer            | Pick                                              | "Why not X?"                                         |
|------------------|---------------------------------------------------|------------------------------------------------------|
| Framework        | **Next.js 16 (App Router + Turbopack)**           | Why not Remix? Vercel-native, RSC story, our deploy target. |
| UI runtime       | **React 19.2**                                    | Comes with Next 16. We use Server Components heavily.|
| Language         | **TypeScript 5**                                  | Catches refactor bugs at compile time.               |
| Styling          | **Tailwind CSS v4**                               | No CSS files; utility classes inline.                |
| UI primitives    | **Hand-rolled in `src/components/ui/`**           | Why not shadcn/ui? We need ~6 primitives; the indirection cost beat the install.    |
| DB               | **PostgreSQL on Neon (serverless)**               | Free tier + branchable DBs for preview.              |
| ORM              | **Prisma 7** + `@prisma/adapter-neon`             | Type-safe queries; Neon adapter needed for edge.     |
| Validation       | **Zod 4**                                         | Same schema validates the form and the action.       |
| Forms (client)   | **react-hook-form** + `@hookform/resolvers`       | Minimal re-renders; integrates Zod via resolver.     |
| Auth             | **Hand-rolled session** (bcryptjs + `jose` JWT)   | Why not NextAuth? Too heavy for our 2-role app.      |
| File storage     | **`@vercel/blob`** (deferred until provisioned)   | Today, résumés are Google Drive links.               |
| Charts           | **Recharts 3**                                    | Simple declarative API, fits Dashboard needs.        |
| Icons            | **lucide-react**                                  | Clean, tree-shaken SVGs.                             |
| Date utils       | **date-fns 4**                                    | Modular, no moment baggage.                          |
| Cookie/JWT       | **jose 6**                                        | Works in Edge runtime (where `jsonwebtoken` doesn't).|
| Deployment       | **Vercel**                                        | Native target; Fluid Compute under the hood.         |

## The big four: Next.js 16, Prisma 7, Tailwind v4, React 19

These are all on the bleeding edge. **Your training data probably
remembers older APIs.** Always verify against `node_modules/next/dist/docs/`
or Prisma's release notes before writing code.

### Next.js 16 — the gotchas that bit us

- **Middleware renamed to "proxy."** The file is `src/proxy.ts` and
  exports a function named `proxy`. There is no `middleware.ts`.
- **`cookies()`, `headers()`, `params`, `searchParams` are ALL async.**
  ```ts
  // pages.tsx (Server Component)
  export default async function Page({ params, searchParams }) {
    const { id } = await params;
    const sp = await searchParams;
    const cookieStore = await cookies();
    // …
  }
  ```
  Forgetting an `await` silently returns a Promise and the value is
  `undefined` downstream. Easy to miss.
- **Turbopack is the default** for `next dev` and `next build`. No flag
  needed. Sometimes its cache gets corrupted; the fix is
  `rm -rf .next && npm run dev`.
- **`revalidateTag` needs a second `cacheLife` arg.** We mostly avoid
  it and use `revalidatePath` or `router.refresh()` instead.

### Prisma 7 — the runtime-adapter twist

- **The client REQUIRES a driver adapter.** It will not run
  unconfigured. See `src/server/db.ts` — we use `@prisma/adapter-neon`
  with the pooled connection.
- **Connection URLs live in two places.**
  - `prisma.config.ts` reads `DIRECT_URL` — used by the CLI
    (`prisma migrate`, `prisma generate`, etc.).
  - `.env` provides `DATABASE_URL` — used by the running app via the
    Neon adapter.
  Mixing them up = "works locally, fails in prod" or vice versa.
- **The generated client lives in `src/generated/prisma/`** (gitignored).
  Import from `@/generated/prisma/client`, never from `@prisma/client`.
  Run `prisma generate` after any schema change (also auto-runs on
  `postinstall`).

### Tailwind v4

- Configured via `@import "tailwindcss"` in `src/app/globals.css` — no
  `tailwind.config.js`.
- v4 dropped the JIT config; theme tokens live in CSS via
  `@theme { … }`.
- Default breakpoints (md = 768) are the same as v3.

### React 19.2

- Server Components are default. A file is a Client Component only if
  it starts with `"use client";`.
- `useTransition` + `<form action={serverAction}>` is the canonical
  mutation pattern. We use that for status updates.
- Hydration mismatches are loud. We use `suppressHydrationWarning`
  selectively on text that intentionally differs SSR vs client (e.g.
  "Showing X of Y columns", which depends on localStorage).

## Why we hand-rolled UI primitives

shadcn/ui is the obvious pick, but:

- We need ~8 primitives total (Table, Dialog, Button, Badge, Field,
  Pagination, FilterBar, ColumnsMenu). The shadcn install fans out
  Radix + cva + class-variance-authority for things we don't need.
- We want **mobile cards <md, real table at md+** without two markups.
  See `src/components/ui/table.tsx` — the responsive trick is a
  single `<table>` with descendant-variant CSS that flips it to
  block layout below `md`. Custom code stayed shorter than wiring
  Radix tables to do the same.
- Tailwind v4 + our design tokens already cover the styling layer.

## Why we hand-rolled auth

NextAuth (now Auth.js) is the obvious pick, but:

- We have two roles and no OAuth providers. NextAuth's surface area
  is mostly unused.
- Our session is a single signed JWT in an HTTP-only cookie. ~80
  lines total in `src/lib/session.ts` + `src/lib/auth-token.ts`.
- We control rate limiting (`src/lib/rate-limit.ts`) and the login
  flow ourselves; NextAuth made some of those harder to customize.

If we ever need SSO ("Sign in with Google for the company GSuite"),
we'll revisit.

## Why Recharts

- Smallest API surface for "render this bar/donut, with axes". The
  Reports page only needs a couple of chart shapes.
- Renders into a `<ResponsiveContainer>` that watches its parent —
  works inside the responsive Card layouts on the Dashboard.
- The one gotcha: `ResponsiveContainer` will measure `-1 x -1` if its
  parent is a flex child without `min-width: 0`. We hit this once;
  the fix is to wrap the chart in an outer div with explicit width,
  height, and `minWidth: 0`. See `src/components/dashboard/charts.tsx`.

## Why Neon

- Postgres-on-the-edge. Serverless driver makes connection management
  irrelevant.
- Free tier large enough for our dataset.
- Branching (one DB per preview deploy) is built in. We don't use
  this yet but it's there.

## File storage — why "Drive link" not Vercel Blob

Today the résumé library stores **Google Drive URLs**, not files. The
team already keeps résumés on Drive, so we just point at them and
embed an inline preview via Google's iframe viewer.

Vercel Blob (`@vercel/blob`) is in the dependencies but commented out
of the flow. We'll switch when a Blob store is provisioned and the
team is ready to upload directly.

## What we did NOT pick (and considered)

- **shadcn/ui** — overkill for our primitive count. See above.
- **NextAuth / Auth.js** — too heavy for two roles. See above.
- **tRPC** — Server Actions already give us end-to-end types. tRPC
  would be a parallel transport for no gain.
- **Drizzle** — we know Prisma; the type-safety story is comparable;
  Prisma's Studio is a nice debug surface.
- **TanStack Query** — Server Components + Server Actions cover all
  our data flows. No client-side caching needed.
- **Zustand / Redux** — there is no global client state. URL params
  are the source of truth for filters/sorting/pagination.
