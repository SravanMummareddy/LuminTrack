# Q 02 — React and Next.js

Twelve common technical questions. For each: outline + LuminTrack
example + watch-out.

---

### Q1. "What's a Server Component, and how is it different from SSR?"

**Outline.**
- RSC: component runs on the server; its source code never ships
  to the browser.
- SSR: a Client Component is rendered to HTML on the server, then
  hydrated.
- RSC is the *default* in App Router; SSR is what happens to
  Client Components rendered inside RSCs.

**Example.** LuminTrack's pages are RSCs that await Prisma queries
directly. The tables inside are Client Components (because they
have state). Concept 01.

**Watch out.** Don't conflate them. RSCs cannot use `useState`.

---

### Q2. "What's a Server Action?"

**Outline.**
- Function marked `"use server";`. Calling it from a Client
  Component does an RPC.
- Bound to `<form action={fn}>` or used via `useActionState` /
  `useTransition`.
- Same TypeScript module; end-to-end types.

**Example.** Every mutation in LuminTrack — `createJob`,
`updateSubmissionStatus`, `markCandidateContacted`. Concept 02.

**Watch out.** A Server Action is *not* a generic API endpoint —
it's an RPC handle.

---

### Q3. "What's a hydration error?"

**Outline.**
- SSR produced HTML; the client's first render disagrees.
- React logs a mismatch warning; replaces the subtree.
- Common causes: localStorage, `Date.now()`, password-manager
  extensions injecting attributes.

**Example.** The "Showing 9 of 10 columns" mismatch — story 01.
Fix: render-then-hydrate pattern + `suppressHydrationWarning`.
Concept 03.

**Watch out.** Don't say "I sprinkle `suppressHydrationWarning`
everywhere." That hides bugs.

---

### Q4. "When would you NOT use a Server Component?"

**Outline.**
- Need state / effects / browser APIs.
- Need real-time interactivity (drag, debounce, hover).
- Using a third-party client-only library.

**Example.** The column-picker dropdown, the global-search
debounce, the dialog focus-trap.

---

### Q5. "How do you handle a slow query inside a page?"

**Outline.**
- `<Suspense fallback={...}>` around the slow region.
- Or split into a child Server Component awaited separately.
- Or render skeleton via `loading.tsx`.

**Example.** LuminTrack's queries are mostly fast (10 rows per
page). For Reports, if it grew, I'd Suspense-wrap each card so
the page paints with skeletons while individual queries resolve.

---

### Q6. "What's `useTransition`?"

**Outline.**
- Marks state updates as non-urgent.
- Returns `[isPending, startTransition]`.
- Lets you show a pending state during an async action without
  blocking input.

**Example.** Submission status update — uses `useTransition` for
the button's pending state. Concept 02.

---

### Q7. "Difference between `useMemo`, `memo()`, and `cache()`?"

**Outline.**
- `useMemo` — client, per mount, deps-driven.
- `memo()` — client, prevents re-renders on referentially-equal
  props.
- `cache()` — server, per request.

**Example.** `getCurrentUser` is wrapped in `cache()` so the
topbar and page share one DB lookup. Concept 04.

---

### Q8. "What's an error boundary?"

**Outline.**
- A component that catches descendant render errors.
- In App Router, `error.tsx` next to `page.tsx`.
- Does NOT catch async errors in event handlers.

**Example.** `src/app/(dashboard)/error.tsx` with a Retry button.
Concept 30.

---

### Q9. "How does `<Suspense>` work with `<Link>` navigation?"

**Outline.**
- Navigation streams the new tree.
- If the next page suspends (e.g. on `loading.tsx`), React keeps
  the old tree visible while showing the fallback in the
  suspended region.

**Example.** I don't use page-level `loading.tsx` today; I'd add
it on the Reports page if I had time.

---

### Q10. "Why URL state and not Redux / Zustand?"

**Outline.**
- URL = shareable, refresh-safe, server-readable.
- Three categories: DB data (server), UI ephemera (`useState`),
  shared view state (URL).
- No global client state library in LuminTrack.

**Example.** `/jobs?status=OPEN&page=2&sort=created`. Concept 05,
concept 22.

---

### Q11. "Why are `params` and `searchParams` async in Next 16?"

**Outline.**
- They're Promises now. Forgetting an `await` returns a Promise,
  not the value.
- Reason: Next can populate them after the render starts (e.g.
  from dynamic IO).

**Example.** Every LuminTrack page starts with `const sp = await
searchParams`. Concept 01 / handbook gotchas page.

---

### Q12. "When would you reach for a Client Component over a
Server Component?"

**Outline.**
- Interactivity, state, browser APIs, third-party client libs.

**Example.** Tables (column picker), Dialogs, Pagination links,
global search.

**Watch out.** A Client Component can *receive* a Server
Component via `children` — useful for composition.
