# 99 — The night-before cheatsheet

> One page. Skim it before walking in. If something here surprises
> you, open the matching concept file and read it.

## Stack in one breath

Next.js 16 App Router + React 19 + TS + Prisma 7 + Postgres on
Neon + Tailwind v4 + Vercel. Hand-rolled JWT auth. RSC by
default; `'use client';` for interactive islands.

## The five sentences that win the room

1. "Every mutation runs inside `prisma.$transaction` with an
   atomic `logActivity` call, so the audit log is never out of
   sync with the data."
2. "Filter/sort/page state lives in the URL — shareable,
   refresh-safe, server-readable, no global client state
   library."
3. "I picked hand-rolled auth over NextAuth because two roles
   and no OAuth — the whole module is ~150 lines I can audit."
4. "The iLabor importer takes a Postgres advisory transactional
   lock so concurrent admin imports don't race on shared org
   entities."
5. "I treat hydration mismatches as bugs to root-cause, not warnings
   to suppress — the column-prefs hook uses a render-then-hydrate
   pattern so SSR and first client render match."

## Concept anchors (one-liners)

| Concept                  | One line                                              |
|--------------------------|-------------------------------------------------------|
| RSC                      | Server-side React; code never ships to client.        |
| Server Action            | Function with `"use server";`; RPC, not REST.         |
| Hydration                | React attaches to server-rendered DOM; mismatches = bugs. |
| `cache()`                | Per-request memoisation for Server Components.        |
| ACID                     | Atomicity / Consistency / Isolation / Durability.     |
| Polymorphic relation     | One row belongs to one of several parent tables.      |
| Composite unique key     | (portalId, portalRefId) — for iLabor upsert.          |
| Advisory lock            | `pg_try_advisory_xact_lock(N)` — name-keyed lock.     |
| Optimistic concurrency   | Version column + WHERE check; no row lock held.       |
| JWT in HttpOnly cookie   | Stateless session; `User.isActive` re-check on each render. |
| bcrypt cost 10           | One-way password hash with embedded salt + cost.      |
| Rate limit               | Fixed window 5/15min/(email, IP).                     |
| Zod                      | Schema-first runtime validation; same schema both sides.|
| URL as state             | Filters/sort/page in query string.                    |
| Offset vs cursor         | Offset = page-N UI; cursor = scale-friendly.          |
| Responsive table         | One `<table>`, descendant-variant CSS flips to cards. |
| Focus trap               | Capture/restore focus, loop Tab, Escape to close.     |
| Edge vs Node / Fluid     | Fluid reuses warm Node instances across requests.     |
| Decimal for money        | `DECIMAL(12,2)`; flatten to string crossing RSC boundary. |
| Timezones                | UTC `timestamptz` + IANA name when intent matters.    |
| Soft delete              | `isActive` flag; audit trail intact.                  |
| Correlation key          | `Activity.note = "importRunId:<id>"` links per-row audits to their parent run. No new table. |
| Pre-create-then-update   | Generate parent row first so children can reference its id; fill description after the loop. |
| Convention vs branching  | `ensureSourceForPortal(db, name)` mirrors every JobPortal as a Source — one helper, no per-portal code path. |
| Per-row mini-txn         | Bulk import: per-row `$transaction(upsert + audit)` + outer advisory lock — beats one 60s big-tx. |

## Files that come up the most

- `src/server/actions/jobs.ts` — canonical transaction + audit pattern.
- `src/server/activity.ts` — `logActivity()` helper.
- `src/lib/session.ts` — `getCurrentUser` wrapped in `cache()`.
- `src/proxy.ts` — Next 16 middleware-renamed-to-proxy.
- `src/lib/use-focus-trap.ts` — accessible dialog hook.
- `src/lib/use-column-prefs.ts` — render-then-hydrate pattern.
- `src/components/ui/table.tsx` — responsive table trick.
- `src/server/actions/ilabor-import.ts` — advisory lock + upsert.
- `prisma/schema.prisma` — polymorphic Note + Activity.

## Stories in one line

1. **Hydration mismatch** — column count text. Render-then-hydrate
   fix. Lesson: SSR and first client render must match.
2. **Recharts -1×-1** — flex `min-width: 0` on the chart parent.
   Lesson: read library source before blaming.
3. **Focus traps** — extracted hook for Dialog + MobileNav.
   Lesson: rule of three (build once, copy once, extract on the
   third).
4. **Hand-rolled auth** — said no to NextAuth. Lesson: pick
   tooling against requirements, not defaults.
5. **Dropping unique constraint** — moved duplicate check to
   action layer with captured reason. Lesson: two-phase
   migration for safety.
6. **ColumnsMenu refactor** — 110 lines × 3 → one shared
   component. Lesson: refactor on the third copy.
7. **Tolerant iLabor envelope** — adapter at the seam.
   Lesson: permissive at the boundary, strict inside.
8. **Learning Next 16 + Prisma 7** — read local docs, write down
   gotchas. Lesson: latest major is a deliberate cost.
9. **Notifications / dark mode deferred** — substituted "My
   work" card. Lesson: reframe the need before building infra.
10. **Concurrent-import near-miss** — added advisory lock during
    handover writing. Lesson: read your own code carefully.
11. **Diff-based re-import** — replaced unconditional overwrite
    with per-field diff + change log via `Activity.note =
    "importRunId:<id>"`. Lesson: don't prevent the bad thing,
    make it visible — audit log + UX often beats a schema flag.
12. **Source-mirror for portals** — `ensureSourceForPortal(db,
    name)` called next to every JobPortal upsert. Lesson:
    convention beats special case when the model will grow.
13. **Expired transaction** — 60s interactive `$transaction`
    around 300 row upserts crashed on Neon's serverless driver
    network latency. Split into advisory-lock + per-row mini-txns.
    Lesson: look at transaction *shape* (round-trip count), not
    the last statement that fired.

## The "I don't know" recipe

1. Clarify the question.
2. Reason from first principles aloud.
3. Connect to something you do know in LuminTrack.
4. "I don't know, but here's how I'd find out."

## Final mental check

- Did you eat?
- Did you sleep enough?
- Phone on silent, water nearby?
- Smile when you greet them. The interview is a conversation
  about something you actually built. You know this stuff. Go.
