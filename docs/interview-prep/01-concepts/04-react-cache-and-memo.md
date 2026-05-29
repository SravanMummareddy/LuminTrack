# 04 — `cache()`, `useMemo`, `memo`, and the rules of memoization

> **In plain English.** Sometimes a function is expensive or hits
> the database, and you don't want to run it twice in the same
> render. Memoization means "remember the result for the same
> inputs." React has *three different tools* for this depending on
> where you are (server, client, or component), and they all do
> slightly different things.

## The technical core

| Tool                          | Where        | Scope                            |
|-------------------------------|--------------|----------------------------------|
| `cache(fn)` (`react`)         | Server only  | One request — memoised across components in the same render. |
| `unstable_cache(fn)` (`next/cache`) | Server | Across requests, with TTL. The data cache. |
| `useMemo(fn, deps)` (`react`) | Client       | One mount — memoised until deps change. |
| `memo(Component)` (`react`)   | Client       | Prevents re-renders when props are unchanged. |

### `cache()` on the server

```ts
import { cache } from "react";
export const getCurrentUser = cache(async () => { /* db lookup */ });
```

Any number of Server Components in one render can call
`getCurrentUser()`. The DB hits exactly once. The cache lives for
*that* request and dies when the request ends.

### `useMemo` on the client

Don't reach for it by default. React 19 + the React Compiler make
many `useMemo`s unnecessary. Use it when:

- The computation is *measurably* expensive.
- You need referential stability for a downstream `useEffect`'s
  deps or a memoised child.

### `memo()`

Wraps a component so it re-renders only when its props change by
identity (`===`). Useful for large lists or expensive components.
Often the wrong tool — the better fix is to move state down.

## Where it lives in LuminTrack

- **`cache()`:** `src/lib/session.ts` wraps
  `getCurrentUser` in `cache()`. The topbar, the page Server
  Component, and any deeper component can call it; only one DB
  lookup happens per request.
- **`useMemo`:** rare. We avoid it unless we measured a problem.
- **`memo()`:** not used. The tables re-render fine without it; if
  perf becomes a problem we'd start with `memo` on the row
  components.

## How to talk about it in an interview

**Sample answer (45 sec):**

> "React 19 actually has three different memoization tools and
> they answer different questions. `cache()` from React is for
> Server Components — it ensures that during one request,
> `getCurrentUser()` only hits the database once even if the
> topbar, the page, and a deep nav link all call it. That's a
> per-request cache. `useMemo` is for client-side computations
> that are *measurably* expensive — I avoid premature
> memoization. And `memo()` wraps a Client Component to skip
> re-renders when props don't change. With the React Compiler
> landing, I expect most `useMemo` calls to become unnecessary."

**Expect:**

- "What's the difference between `cache()` and Next's
  `unstable_cache()`?" → `cache()` is per-request, in-memory.
  `unstable_cache()` is cross-request, with TTL — a real data
  cache (Redis / disk).
- "When is `useMemo` actually needed?" → When the cost of running
  the computation exceeds the cost of the equality check, or when
  you need a stable reference for a child's memo / effect.

## Mistakes to avoid saying

- ❌ "useMemo improves performance." Sometimes; sometimes it
  hurts. It's a trade-off.
- ❌ "memo() prevents all re-renders." It only skips if props are
  referentially equal.
- ❌ Mixing up `cache()` (request-scoped) with `unstable_cache()`
  (data-cache with TTL). They're different.

## Go deeper

- React docs: [`cache`](https://react.dev/reference/react/cache),
  [`useMemo`](https://react.dev/reference/react/useMemo),
  [`memo`](https://react.dev/reference/react/memo).
- React Compiler announcement — what it auto-memoizes for you.
