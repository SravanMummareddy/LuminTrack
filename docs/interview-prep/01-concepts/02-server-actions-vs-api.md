# 02 — Server Actions vs REST API routes

> **In plain English.** A Server Action is a function you can call
> from a browser button or form that actually runs on the server.
> You don't have to build an `/api/...` URL, send a `fetch`, parse
> JSON, and handle errors — Next.js does all that for you. The
> function reference is the API. LuminTrack uses Server Actions for
> every mutation and has exactly one classic API route (the search
> typeahead).

## The technical core

A Server Action is a function marked with `"use server";`. It runs
on the server even when called from a Client Component. Under the
hood:

1. Next compiles each action to an HTTP endpoint with a stable ID.
2. The Client Component receives a *reference* (an opaque function).
3. Calling that reference POSTs to the endpoint, sends serialized
   arguments, and awaits the result.
4. The runtime validates an internal CSRF token and routes the call.

You bind a Server Action to a `<form>` two ways:

```tsx
// React 19 form-action prop — works without JS
<form action={createJob}>...</form>

// useActionState — pairs with a pending boolean and FormState
const [state, action, pending] = useActionState(createJob, {});
<form action={action}>...</form>
```

Or call the action programmatically from an event handler:

```tsx
const [pending, start] = useTransition();
start(() => updateStatus(formData));
```

### When to use a Server Action vs an API route

| Need                             | Server Action | API route (`route.ts`) |
|----------------------------------|---------------|------------------------|
| Form submit / button click       | ✅            | works but more code    |
| External webhook receiver        | ❌            | ✅                     |
| Public REST endpoint             | ❌            | ✅                     |
| Real-time / streaming (SSE/WS)   | ❌            | ✅                     |
| Mobile/native client             | ❌            | ✅                     |
| Typed RPC between your own UI    | ✅            | overkill               |
| File downloads with custom headers| ❌           | ✅                     |

## Where it lives in LuminTrack

- **Every mutation is a Server Action.** See
  `src/server/actions/*.ts` — `createJob`, `updateSubmissionStatus`,
  `createRound`, `markCandidateContacted`, `loginAction`,
  `logoutAction`, etc.
- **One API route exists.** `src/app/api/search/route.ts` powers the
  global-search typeahead. It's a route because the search dropdown
  is a per-keystroke debounced JSON endpoint — easier as a route
  handler than a Server Action.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "I picked Server Actions over building a REST layer because the
> only consumer of these endpoints is LuminTrack itself. A Server
> Action gives me end-to-end type safety — the action's return
> type flows straight into the component that calls it — and
> avoids inventing URL schemes and DTOs for internal RPCs. Every
> mutation in the app, from creating a job to marking a candidate
> contacted, is one of these. The one exception is the global
> search dropdown, which needs a per-keystroke JSON endpoint, so
> that's a route handler under `src/app/api/search/route.ts`. If we
> ever needed to expose data to a mobile app or external webhook,
> I'd add route handlers there."

**Expect these follow-ups:**

- "How is CSRF handled?" → Next.js signs action invocations
  internally, plus our session cookie is `SameSite: lax`.
- "What about errors?" → Actions return a `FormState` object
  (`{ error?, fieldErrors?, ok? }`) consumed by `useActionState`.
  Field errors render inline; top-level errors render as a banner.
- "Could you do background work in a Server Action?" → No — actions
  run within the request lifecycle. Long jobs go to a queue (which
  LuminTrack doesn't have yet; see growth roadmap).

## Mistakes to avoid saying

- ❌ "Server Actions are just an alias for API routes." They're a
  different RPC model — type-safe, framework-managed.
- ❌ "I always use Server Actions." Public APIs and webhooks
  shouldn't be Actions; they need stable URLs and authentication
  outside Next's flow.
- ❌ "Server Actions are slower than fetch." The transport is the
  same HTTP POST; perf is comparable.

## Go deeper

- Next.js docs: [Server Actions and Mutations](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
- React docs: [`useActionState`](https://react.dev/reference/react/useActionState).
- Compare to tRPC and GraphQL mutations — same conceptual shape,
  different ergonomics.
