# 30 — Error and loading boundaries

> **In plain English.** When something on the page is loading or
> broken, you don't want the whole app to disappear or freeze.
> *Loading boundaries* (Suspense) show a fallback while data is
> in flight. *Error boundaries* catch crashes and show a "something
> went wrong" panel instead of a blank screen. Both are about
> *resilience at the seams* — being thoughtful about what fails
> together and what stays alive.

## The technical core

### Error boundaries (React)

A component that wraps a subtree and renders a fallback if a
descendant throws:

- Pre-Next-App-Router: a class component with `componentDidCatch`.
- App Router: `error.tsx` next to a `page.tsx` is auto-wrapped
  around that segment.

```tsx
// src/app/(dashboard)/error.tsx
"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <h2>Something went wrong.</h2>
      <button onClick={reset}>Retry</button>
    </div>
  );
}
```

The boundary catches:
- Rendering errors in the segment.
- Errors thrown by Server Components during render.
- Server Action errors *if* they propagate (not caught and
  returned in `FormState`).

It does NOT catch:
- Async errors in event handlers (use try/catch).
- Errors during SSR's initial paint (those bubble up).

### Loading boundaries (Suspense)

`loading.tsx` next to `page.tsx` becomes the Suspense fallback for
the segment. Renders while the page awaits.

For finer control, use `<Suspense fallback={<Spinner />}>` inside
a page to gate individual slow regions.

### `not-found.tsx`

A sibling to `error.tsx`. Renders when a Server Component calls
`notFound()` or when the route doesn't exist.

### The resilience trio

In Next App Router each segment can have:

- `page.tsx` — the actual page.
- `loading.tsx` — fallback while page renders.
- `error.tsx` — fallback if page throws.
- `not-found.tsx` — 404 within the segment.

Each one is a boundary; you can have them at different depths.
The closest ancestor catches.

## Where it lives in LuminTrack

- `src/app/(dashboard)/error.tsx` — global error boundary for the
  authenticated app. Friendly message + Retry.
- `src/app/(dashboard)/not-found.tsx` — 404 within the dashboard.
- `src/app/not-found.tsx` — pre-login 404 fallback.
- `src/app/error.tsx` (if present) — top-level crash boundary.

Today there's no `loading.tsx` per route — queries are fast
enough that the streamed render covers the wait. It would be a
one-line drop-in if needed.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Resilience boundaries in LuminTrack lean on Next App Router's
> conventions: `error.tsx`, `not-found.tsx`, and (when needed)
> `loading.tsx` are colocated with each segment's `page.tsx`. The
> dashboard segment has both: a friendly error card with a Retry
> button that calls the boundary's `reset()` callback, and a
> not-found page for missing routes within the authenticated
> area. The trick people miss is that `error.tsx` catches
> *render* errors but not async errors in event handlers — those
> need try/catch. And Server Action errors only reach the
> boundary if you let them; in our code we return errors as part
> of the `FormState` object instead, because we want inline
> field-level messaging, not a full-page replacement."

**Expect:**

- "What's the difference between throwing and returning an error
  from a Server Action?" → Throwing routes to the boundary
  (full-page); returning lets the form render the message
  inline.
- "When would you add `loading.tsx`?" → When the page has a
  slow query and you want a skeleton during streaming.
- "How does this interact with Suspense?" → `loading.tsx` *is* a
  Suspense boundary under the hood.

## Mistakes to avoid saying

- ❌ "Error boundaries catch everything." Event handlers and
  promises don't bubble to them.
- ❌ "loading.tsx is optional, don't bother." For slow segments it
  meaningfully improves perceived performance.

## Go deeper

- Next.js docs: [error.tsx](https://nextjs.org/docs/app/api-reference/file-conventions/error),
  [loading.tsx](https://nextjs.org/docs/app/api-reference/file-conventions/loading).
- React docs: [Error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary).
- Kent C. Dodds' "React Error Boundaries" essay.
