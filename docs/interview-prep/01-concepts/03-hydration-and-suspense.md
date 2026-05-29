# 03 — Hydration and Suspense

> **In plain English.** Hydration is when the server-rendered HTML
> "wakes up" in the browser — React attaches event handlers and
> takes over rendering. If the HTML the server made doesn't match
> what the client wants to render, you get a hydration error.
> Suspense is React's way of saying "this part of the tree is still
> loading; show a fallback meanwhile."

## The technical core

### Hydration

The server emits HTML. The browser parses it, paints pixels, and
runs the React bundle. React walks the existing DOM and *attaches*
to it instead of recreating it. For this to work, the React tree
it expects to render must match the DOM exactly: same tags, same
attributes, same text.

When they differ, you get an error like:

> "Hydration failed because the server-rendered HTML didn't match
> the client. As a result this tree will be regenerated on the
> client."

Common causes:

1. **Reading browser-only state during render.** `localStorage`,
   `window`, `Date.now()`, `Math.random()` — server doesn't have
   them. Output diverges.
2. **Browser extensions injecting attributes.** Password managers
   add `data-np-*` / `data-lastpass-*` to inputs before React
   hydrates.
3. **Conditional rendering on `typeof window`** without care.

Fixes:
- **`suppressHydrationWarning`** — explicit opt-out on a single
  element where you know the mismatch is harmless and intentional.
- **Render the same content first, then update.** Use the
  "render-fall-back-then-hydrate-from-localStorage" pattern: server
  and first client render show defaults; a follow-up render swaps
  to the real value.

### Suspense

`<Suspense fallback={<Spinner />}>` lets a part of the tree wait
for data without blocking the whole page. The fallback shows while
the inner tree is "suspended" (waiting on a promise). When the
promise resolves, React swaps in the resolved tree.

In Next 16, `loading.tsx` is a route-level Suspense boundary
auto-applied to the segment's page. Streaming pages can paint a
skeleton while a slow query completes.

## Where it lives in LuminTrack

- **`suppressHydrationWarning` cases:**
  - `src/components/jobs/jobs-table.tsx` (and candidates / submissions)
    — the "Showing X of Y columns" text depends on
    `localStorage` column prefs. Server doesn't know them; SSR
    shows defaults; localStorage reconciliation happens after mount.
  - `src/components/ui/field.tsx` — `Input`/`Textarea`/`Select` all
    set it. Reason: password-manager extensions inject `data-np-*`
    attributes.
  - `src/components/ui/filter-bar.tsx` — the `<form>` itself.
- **The render-then-hydrate pattern:** `src/lib/use-column-prefs.ts`
  returns `defaults` on the server and first client render, then
  swaps to stored prefs during the *second* render via the React
  "adjust state during render" pattern. A brief flash is preferred
  to a hydration error.
- **Loading boundaries:** today we don't use a `loading.tsx` per
  route extensively — queries are fast enough that the streamed
  render covers the wait. Adding one would be a one-line drop-in.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "I hit a real hydration mismatch on the submissions list: the
> 'Showing 9 of 10 columns' text was off by one between server and
> client because the column-prefs hook reads localStorage, which
> doesn't exist on the server. My first thought was 'render
> nothing on the server,' but that meant a layout shift after
> hydration. Instead I made the hook return the defaults during
> SSR and during the first client render — same output, no
> mismatch — and then swap to the stored prefs on the next render
> via the 'adjust state during render' pattern in React 19. The
> count text gets `suppressHydrationWarning` because the brief
> flash is intentional and harmless. I learned the hard rule:
> SSR and the first client render must be byte-identical, or
> hydration won't work."

**Expect these follow-ups:**

- "What does `suppressHydrationWarning` actually do?" → Tells React
  to NOT log a warning for *that one element*; the mismatch still
  happens, you're just saying you accept it.
- "How does Suspense interact with RSC?" → Server Components can
  await data; Suspense boundaries let parts of the tree stream
  with their own fallbacks while siblings finish.

## Mistakes to avoid saying

- ❌ "I sprinkle `suppressHydrationWarning` everywhere." That hides
  bugs. Use it deliberately, on the smallest possible element.
- ❌ "Hydration is just SSR." Hydration is the *attach step* after
  SSR.
- ❌ "Suspense is for code-splitting." It's used for both data and
  code splitting; in App Router it's primarily data.

## Go deeper

- React docs: [`Suspense`](https://react.dev/reference/react/Suspense)
  and [Hydration errors](https://react.dev/errors/418).
- Josh W Comeau's article "The Perils of Rehydration" (still the
  best layman explainer).
