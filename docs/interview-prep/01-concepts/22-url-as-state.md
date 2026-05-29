# 22 — URL as state

> **In plain English.** Instead of storing filter and sort and
> pagination state in JavaScript variables, put them in the URL
> query string. The URL becomes shareable, refresh-safe, and the
> server can read it directly. No client-side state library
> needed.

## The technical core

### The mental shift

Most React tutorials show:

```tsx
const [status, setStatus] = useState("OPEN");
const [page, setPage] = useState(1);
const [sort, setSort] = useState("created");
```

Then you fetch in a `useEffect` driven by those. A page refresh
loses all of it. Sharing the link is impossible. Server can't
read it.

The fix: those values live in the URL.

```
/jobs?status=OPEN&page=1&sort=created&dir=desc
```

Server reads `searchParams`, runs the query, renders. Client
links update the URL via `<Link>` or `router.push`. The URL is
the source of truth — components derive view state from it.

### Why this is a fit for Next App Router

- Pages are Server Components by default; they receive
  `searchParams` natively.
- Navigation is automatic via `<Link>`; no manual state sync.
- Server caches and revalidation key off the URL.
- Browser back/forward "just works."

### When NOT to use it

- Hover states, modal-open flags, dropdown open — pure UI
  ephemera. Stuff that doesn't deserve a URL.
- Anything sensitive (don't put PII in URLs).
- Very high-frequency updates (every keystroke would spam history).

For the typeahead search in LuminTrack we keep the *open dropdown
state* in component state but submit the search query as a normal
`fetch` (not a URL update) — that's the right boundary.

## Where it lives in LuminTrack

- `src/lib/filters.ts` — `parsePage`, `parseSort`,
  `parseDateRange`. All consume `searchParams`.
- `src/lib/analytics.ts` — `parseAnalyticsParams` for the Dashboard
  + Reports filter bar.
- Every list page (`/jobs`, `/candidates`, `/submissions`) reads
  filters from URL.
- `src/components/ui/pagination.tsx` — builds `<Link>` per page
  number. Sub-tables pass a `paramKey` (`subs`, `ints`) so they
  don't stomp each other on the same page.
- `src/components/ui/filter-bar.tsx` — wraps a `<form
  method="GET">`. Submitting the form updates the URL.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Filter, sort, and pagination state on every list page in
> LuminTrack lives in the URL — `/jobs?status=OPEN&sort=created&dir=desc&page=2`.
> The Server Component reads `searchParams`, validates them
> against a whitelist via helpers in `src/lib/filters.ts`, runs
> the Prisma query, renders. The benefit cascade is: links are
> shareable, refresh keeps state, back/forward works for free,
> and the server doesn't need to be told what the client knows
> — they read from the same source. The one thing I'm careful
> about is *what deserves a URL.* Modal open/close, hover, drop-
> down state — those stay in component state. URLs are for
> *view state that another user could meaningfully share.*
> Sub-tables on the same detail page use namespaced param keys
> like `?subs=` and `?ints=` so they don't stomp each other."

**Expect:**

- "What about typeahead search queries?" → Those flow through
  state + fetch, not URLs — debounced per keystroke, an open
  dropdown isn't a meaningful URL.
- "Does this cause cache misses?" → Yes, every URL is a distinct
  cache key. That's the cost; for our scale it's fine.

## Mistakes to avoid saying

- ❌ "URL state is for everything." It isn't — UI ephemera doesn't
  belong there.
- ❌ "URL state is bad for SEO." It's neutral; in fact, indexed
  filtered pages can help.

## Go deeper

- Next.js docs on `searchParams` (note: async in Next 16).
- The TanStack Router team's writing on "search params as
  first-class state."
