# 05 — Server state vs client state (and why we have no Redux)

> **In plain English.** Some data lives on the server (rows in a
> database). Some lives in the browser (which row is highlighted,
> is the dropdown open). Treating these the same way is the source
> of half the bugs in web apps. LuminTrack keeps them separate:
> server data via Server Components, client state via `useState`,
> and shared state via the URL.

## The technical core

Three categories of state, three storage layers:

| State                                   | Stored in           |
|-----------------------------------------|---------------------|
| Persistent business data                | The database.       |
| UI ephemera (open dropdowns, hover)     | Local `useState`.   |
| Shared cross-component view state       | The URL (query string). |

The classic mistake: pulling DB data into a global client store
(Redux, Zustand) and trying to keep it in sync. Now you have a
cache invalidation problem — the hardest problem in CS.

The modern Next.js approach:

- **DB data** stays on the server. Pages re-fetch when navigated to
  (with built-in caching). Mutations call `revalidatePath()`.
- **UI state** stays local in the smallest possible Client
  Component.
- **View state** (filters, sort, page, current tab, scope) goes in
  the URL. Then it's: deep-linkable, refresh-safe, server-readable,
  and shareable.

## Where it lives in LuminTrack

- **DB data:** Prisma queries in `src/server/queries/*.ts`. No
  client cache. `revalidatePath` after mutations.
- **UI ephemera:** `useState` inside the component that owns the
  affordance.
  - `src/components/ui/dialog.tsx` — `open` prop owned by parent
    forms.
  - `src/components/layout/user-menu.tsx` — local `open` state.
  - `src/components/ui/columns-menu.tsx` — local drag state.
- **View state in the URL:** every list page reads its filters/
  sort/page from `searchParams`. The Pagination, FilterBar, and
  SortableHeader components all write back into the URL.
- **localStorage** holds *user preferences* (column visibility +
  order via `useColumnPrefs`, recently-viewed via `analytics.ts`)
  but nothing that needs to be authoritative.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "LuminTrack has no Redux, Zustand, or TanStack Query — and that
> was deliberate. I draw three lines: database data lives on the
> server, UI ephemera lives in the smallest Client Component that
> needs it, and shared view state lives in the URL. So when you
> sort the Jobs table by 'Created desc', the page is at
> `/jobs?sort=created&dir=desc`. That URL is shareable,
> refresh-safe, and the server reads it directly via Next 16's
> async `searchParams`. There's no client-side filter store to
> keep in sync. The only piece of cross-component client state is
> the column-prefs hook, which persists to localStorage — and
> that's a *preference*, not authoritative data."

**Expect:**

- "When would you reach for Zustand / Redux?" → If we had complex
  client-only state with deep coordination — e.g. a multi-step
  wizard that survives navigation without URL params, or a rich
  drag-and-drop editor. We don't.
- "Why URL state over context?" → URL is deep-linkable and
  serializable for free; context resets on refresh.

## Mistakes to avoid saying

- ❌ "No global state means small apps." False — you can build big
  apps without Redux. Most of the world's React production code
  no longer uses it.
- ❌ "URL params are bad for state." They're great for *view*
  state. They're wrong for ephemera that doesn't deserve a URL.

## Go deeper

- Mark Erikson (Redux maintainer) on "the modern Redux usage you
  probably don't need" — search his blog.
- TanStack Query docs on the difference between *server state* and
  *client state*.
