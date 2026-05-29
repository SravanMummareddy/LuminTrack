# SD 01 — The whiteboard pitch for LuminTrack

> Use this when an interviewer says "draw the architecture" or
> "tell me about the system you built." Aim for 3–5 minutes
> talking, with a sketch on the whiteboard.

## What to draw

```
                ┌────────────┐
                │  Browser   │
                │  React 19  │
                └─────┬──────┘
                      │  HTTP (Server Action POST / page GET)
                      ▼
   ┌─────────────────────────────────────────────┐
   │              Vercel (Fluid Compute)         │
   │  ┌──────────────────┐    ┌────────────────┐ │
   │  │ proxy.ts (edge)  │    │  Node Function │ │
   │  │ JWT verify gate  │───▶│  - page render │ │
   │  └──────────────────┘    │  - actions     │ │
   │                          │  - Prisma      │ │
   │                          └────────┬───────┘ │
   └───────────────────────────────────┼─────────┘
                                       │ DATABASE_URL (pooled)
                                       ▼
                          ┌──────────────────────────┐
                          │  Neon Postgres           │
                          │  - models                │
                          │  - polymorphic Note/Activity
                          │  - migrations            │
                          └──────────────────────────┘
```

Add three labels off to the side:

- "RSC by default; `'use client';` for interactive islands"
- "Mutations = Server Actions; reads = `src/server/queries/`"
- "Every mutation runs inside `prisma.$transaction` with `logActivity`"

## The 3-minute talk-track

1. **What it is.** "LuminTrack is an internal recruiting tracker
   for a 10-person team — jobs, candidates, submissions,
   interview rounds, audit log. Replaces a manual Excel
   process."

2. **The stack.** "Next.js 16 App Router, React 19, TypeScript,
   Prisma 7 against Postgres on Neon, Tailwind v4 for UI,
   deployed to Vercel. Auth is hand-rolled because two roles and
   no OAuth — JWT in a HttpOnly cookie, bcrypt password hashes,
   rate-limited login."

3. **The shape.** "Pages are Server Components — they await
   queries from `src/server/queries/` and render to HTML.
   Anything interactive — column pickers, dialogs, the
   typeahead search — is a Client Component opted in with
   `'use client';`. Mutations are Server Actions in
   `src/server/actions/` — same TypeScript module, called from
   forms with React 19's `useActionState`."

4. **The invariant.** "The big rule: every mutation runs inside a
   `prisma.$transaction` that includes a `logActivity` call.
   That gives me an atomic audit log — you can never have a
   change without its audit row. The `Activity` table is
   polymorphic with four nullable FKs (Job, Candidate,
   Submission, InterviewRound). Timeline queries roll up an
   entity's activity with its descendants'."

5. **The interesting bit.** "Two things I'm proud of. First, the
   iLabor import — admins upload a JSON capture of requisitions
   and we upsert them on a composite key, all inside a
   transaction with a Postgres advisory lock to serialize
   concurrent imports. Second, the table component: one
   `<table>` element that flips to a card layout below the `md`
   breakpoint using descendant CSS variants, no JS-mediated
   layout swap."

6. **What's pending.** "The browser extension that automates the
   iLabor JSON capture is the last piece — it lives in a
   separate repo. Notifications and dark mode are deferred
   indefinitely; we have a 'My work — needs attention'
   dashboard card that solves most of the notification need
   without infrastructure."

## Boxes you can elaborate on if asked

- "Walk me through a request." → See `docs/handbook/03-architecture.md`.
- "Tell me about the audit log." → See concept 07.
- "How does auth work?" → See concept 16.
- "How would you scale it?" → See `03-scaling-to-100x.md`.
- "What would you change with hindsight?" → See `04-with-hindsight.md`.

## Things to NOT draw

- Microservices. (You don't have any.)
- A message queue. (You don't have one.)
- A CDN diagram. (Vercel handles it; not architecturally
  interesting unless asked.)
- Redis. (You don't have one.)

Lying or padding the diagram is the fastest way to lose trust.
What you have is honestly enough.
