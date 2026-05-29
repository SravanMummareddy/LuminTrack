# LuminTrack — portfolio entry

> Copy-paste-ready text for your resume, portfolio site, LinkedIn,
> a repo README, and a 60-second elevator pitch. Tailor by
> cutting, never by inflating.

---

## The one-liner (for resume header / portfolio tile)

> **LuminTrack** — An internal recruitment tracking dashboard
> replacing a manual Excel/Word workflow for a 10-person
> recruiting team. Built with Next.js 16, React 19, Prisma 7,
> Postgres, and TypeScript. Deployed on Vercel.

## The 3-sentence pitch (for portfolio "About" blurb)

> LuminTrack is an internal dashboard that tracks job
> requirements, candidate submissions, interview rounds, and
> recruiter performance for a small recruiting team. It
> replaces a fragile Excel-and-Word process with one source of
> truth backed by Postgres, with a strict audit log that
> guarantees every change is traceable. Built end-to-end on
> Next.js 16's App Router with React Server Components, hand-
> rolled JWT auth, and a tolerant bulk-import pipeline for
> requisitions pulled from Randstad's iLabor portal.

## The 60-second elevator pitch (for conversations / video)

> "LuminTrack is an internal recruitment tracker I built to
> replace a manual Excel + Word process for a small recruiting
> team. The flow is: a job comes in from a partner company, our
> recruiters submit candidates to it, interviews happen, and a
> candidate eventually joins — every step needed to be
> traceable. I built it on Next.js 16 with React Server
> Components for fast first paint, Prisma against Postgres on
> Neon, and a hand-rolled JWT auth module since the team is
> small and doesn't need OAuth. The thing I'm proudest of is
> the audit invariant — every mutation runs inside a
> Postgres transaction that includes the audit-log write, so
> you can never have a change without its history. I also built
> a bulk importer for Randstad's iLabor portal that uses a
> Postgres advisory lock to serialize concurrent imports. The
> whole thing's deployed on Vercel with a sub-second first
> paint on the main list pages."

---

## Tech stack

**Frontend.** Next.js 16 (App Router, Turbopack) · React 19.2
· TypeScript · Tailwind CSS v4 · hand-rolled UI primitives ·
Recharts · lucide-react.

**Backend.** Next.js Server Actions · Prisma 7 with the Neon
driver adapter · PostgreSQL on Neon · Zod 4 for validation ·
react-hook-form on the client.

**Auth & security.** Hand-rolled session: `jose` JWT in an
HttpOnly cookie · bcryptjs password hashing · in-process
sliding-window rate limiter · SameSite + CSRF defenses ·
admin/recruiter role gating.

**Infra.** Vercel (Fluid Compute) · Neon Postgres · Edge proxy
for the auth gate · environment-isolated migrations.

**Tools.** date-fns · Prisma Studio · Playwright MCP for UI
audits.

---

## Key features (with the *technical* angle worth bragging about)

### 1. Atomic audit log

Every mutation writes an `Activity` row inside the same
`prisma.$transaction` as the data change. The audit table is
polymorphic — four nullable FKs (Job, Candidate, Submission,
InterviewRound) plus a discriminator enum — and `logActivity()`
takes a `Prisma.TransactionClient` so the type system stops you
from calling it outside a transaction. **Result:** the activity
timeline is the source of truth; you can never have an orphan
change.

### 2. Bulk import with concurrency control

Admin uploads a JSON capture from Randstad's iLabor portal at
`/jobs/import`. The pipeline: read-only preview action → confirm
action wrapped in `prisma.$transaction` → `pg_try_advisory_xact_lock`
to serialize concurrent imports → composite-key upsert on
`(portalId, portalRefId)` so re-imports update instead of
duplicating. A tolerant envelope adapter lets the importer
accept raw network captures today; it will accept the cleaner
output of the future browser extension unchanged.

### 3. Responsive tables without two markups

One `<table>` element morphs into a stack of cards below the
`md` breakpoint via descendant CSS variants — no JavaScript-
mediated layout swap, no hydration mismatch. Includes a pure-CSS
"scroll shadow" (Lea Verou's trick) that reveals itself only
when the table actually overflows.

### 4. URL-as-state everywhere

Filter, sort, page, scope, sub-table pagination — all live in
the query string. List pages read from Next 16's async
`searchParams`. Multiple paginated sub-tables on the same detail
page coexist via namespaced param keys (`?subs=`, `?ints=`,
`?rsubs=`). Result: shareable links, refresh-safe state, zero
global client state library.

### 5. Persistent column preferences

Per-table column show/hide and drag-reorder, persisted to
`localStorage` with schema versioning. Uses a render-then-
hydrate pattern so SSR and the first client render produce
identical output — no hydration mismatch, brief flash on first
load.

### 6. Real-time submission status pipeline

Submissions walk a 10-state pipeline (SUBMITTED → ... → JOINED).
Status changes capture an event date, a free-text note, and a
preset reason on the audit row. The pipeline visualisation
shows where each submission sits at a glance.

### 7. Accessibility primitives

Reusable `useFocusTrap` hook for dialog + mobile-nav: Tab/Shift-
Tab loops, Escape closes, body-scroll locks, focus restores on
close. Global search is a proper ARIA combobox with ↑/↓/Enter
keyboard nav.

### 8. Recruiter analytics & reports

Dashboard KPIs with date-range filters, "My work — needs
attention" card driven by a custom server query, time-to-fill
and time-in-stage reports computed from audit-log walks, client
revenue projection, and recruiter aging tables.

---

## Resume bullets

Pick 3–4. Keep them sharp. Numbers if you can.

- **Built LuminTrack, an internal recruitment tracker** on
  Next.js 16 / React 19 / Prisma 7 / Postgres, replacing a
  manual Excel + Word workflow for a 10-recruiter team.
- **Designed an atomic audit log** with a polymorphic
  `Activity` table; every mutation runs inside a Prisma
  transaction guaranteeing the audit row commits together with
  the data change.
- **Built a bulk-import pipeline** for an external requisitions
  portal using a Postgres advisory lock for concurrency control
  and composite-key upserts for idempotent re-imports.
- **Hand-rolled JWT auth** with `jose` + bcrypt + an in-process
  rate limiter, deliberately picking against NextAuth for a
  two-role / no-OAuth use case (~150 LOC, full audit).
- **Designed a responsive table primitive** that switches
  between card and table layouts via descendant CSS variants,
  with no JS-mediated layout swap or hydration mismatch.
- **Shipped 7 phases end-to-end** (Auth → Jobs → Candidates →
  Submissions → Interview Rounds → Audit → Dashboard + Reports)
  plus an iLabor importer over [N] weeks, with phase-by-phase
  product-owner approval.

---

## Portfolio site long-form

Lift this for a "Project" page. Adjust pronouns / tense to your
voice. Keep the honesty about scope.

### Overview

LuminTrack is an internal-tool dashboard for a 10-person
recruiting team. The team previously tracked jobs, candidates,
submissions, and interview outcomes across a shared Excel
workbook and per-candidate Word docs — duplicates slipped, no
audit trail existed, and producing recruiter-performance
reports meant manual aggregation. LuminTrack centralises all of
this into one Postgres database with a permanent audit log
visible on every record.

### The role

I built LuminTrack end-to-end: data modeling, backend, frontend,
auth, deployment. Iterative phase-by-phase development with the
product owner approving between phases.

### Technical highlights

- **React Server Components by default**, with Client Components
  reserved for interactive primitives (tables, dialogs, search,
  forms). Server-side data flows directly via Prisma → Server
  Component → JSX; the only API route in the app is the
  global-search typeahead.
- **An invariant audit log.** Every mutating Server Action wraps
  its data write and `logActivity()` call in one
  `prisma.$transaction`. The `Activity` table is polymorphic
  across the four primary entities. Timeline queries roll up
  descendants — opening a Job shows its activity *and* every
  submission's *and* every round's, in one indexed query.
- **A bulk requisition importer** for Randstad's iLabor portal:
  admins upload a JSON capture, a read-only preview action
  validates and surfaces row-level errors, and a confirm action
  upserts inside a transaction guarded by a Postgres advisory
  lock. The upsert key is a composite `(portalId, portalRefId)`
  unique constraint, so re-imports are idempotent.
- **A hand-rolled session model** (~150 LOC) — `jose` JWT in an
  HttpOnly `SameSite: lax` cookie, bcryptjs hashes at cost 10,
  rate-limited login (5 attempts / 15 min / email+IP), and
  revocation via an `isActive` flag re-checked on every render.
- **A responsive table primitive** that renders one `<table>`
  but switches to a card layout below the `md` breakpoint using
  descendant CSS variants. Mobile cards are tappable via a
  stretched `::before` overlay; horizontal scroll is signalled
  with a pure-CSS scroll-shadow.
- **URL-driven view state** — every filter, sort, and page lives
  in the query string. No Redux, no Zustand. Sub-tables on
  detail pages use namespaced param keys.

### Architectural choices I'm willing to defend

- **Hand-rolled auth over NextAuth.** Two roles and no OAuth made
  NextAuth net negative. Full auth module is ~150 LOC across
  four files.
- **Polymorphic Note + Activity tables.** Real FK constraints
  with cascade, single indexed lookup for "everything that
  touched this entity," and only four entity types (bounded).
- **Last-write-wins, not optimistic concurrency.** Internal tool;
  10 users; concurrent edits on the same row are vanishingly
  rare and the audit log captures both. OCC justified at 100×
  scale.
- **Offset pagination over cursor.** Page-number UI was a
  product requirement; dataset is thousands, not millions.
  Documented the cursor migration path for when it grows.

### What's deferred (honest scope)

- A browser extension (separate repo, Manifest V3) to automate
  the iLabor JSON capture. Today admins copy from DevTools.
  Phase 8b.
- Notifications + dark mode — deferred indefinitely; "My work —
  needs attention" Dashboard card solved most of the
  notification need.
- 2FA, résumé parsing, PII export — tracked in
  `ENHANCEMENTS.md` as future items.

---

## Repo README (top section)

Drop this into the repo's README.md (replacing the current one,
or alongside it):

```markdown
# LuminTrack

Internal recruitment tracking dashboard for a small recruiting
team. Replaces a manual Excel / Word workflow with a single
Postgres-backed system that tracks jobs, candidates,
submissions, interviews, and outcomes — with a permanent audit
log on every change.

## Stack

Next.js 16 · React 19 · TypeScript · Prisma 7 · PostgreSQL
(Neon) · Tailwind v4 · Zod · `jose` + bcrypt auth · Recharts ·
Vercel.

## Highlights

- **Atomic audit log.** Every mutation writes a transactional
  `Activity` row alongside the data change.
- **Bulk import pipeline** for an external requisitions portal,
  guarded by a Postgres advisory lock.
- **Hand-rolled JWT auth** (`jose` + bcrypt + rate limit).
- **React Server Components** by default; Client islands for
  interactivity.
- **URL-as-state** for filters, sort, pagination across every
  list view.
- **Responsive table primitive** — one `<table>` element flips
  to a card layout below `md` via descendant CSS.

## Local development

\`\`\`bash
npm install
cp .env.example .env  # fill in DATABASE_URL, AUTH_SECRET, etc.
npm run db:migrate
npm run db:seed       # or: tsx prisma/seed-demo.ts
npm run dev
\`\`\`

Demo admin (after seed-demo): `admin@lumintrack.com` /
`LuminTrack2026!`.

## Docs

- [`docs/handbook/`](./docs/handbook/) — full intern-style
  handbook covering every workflow and concept.
- [`docs/PROJECT_REQUIREMENTS.md`](./docs/PROJECT_REQUIREMENTS.md)
  — the original requirements.
- [`docs/PLAN_iLabor_import.md`](./docs/PLAN_iLabor_import.md) —
  iLabor bulk-import architecture.
```

---

## LinkedIn project entry

LinkedIn project entries have title, dates, and a description.
Here's a tight description:

> **LuminTrack — Internal recruitment tracking dashboard**
>
> Designed and built an internal dashboard for a 10-person
> recruiting team to replace a manual Excel + Word workflow.
> Tracks jobs, candidates, submissions, interview rounds, and
> recruiter performance with a permanent audit log on every
> change.
>
> Stack: Next.js 16 (App Router, RSC) · React 19 · TypeScript
> · Prisma 7 · PostgreSQL (Neon) · Tailwind v4 · Zod · `jose`
> JWT auth · Recharts · Vercel.
>
> Notable work:
> · Atomic audit-log invariant — every mutation wraps the data
>   write and `logActivity()` in one Prisma transaction.
> · Bulk requisition importer for an external portal using
>   Postgres advisory locks and composite-key upserts.
> · Hand-rolled session module (~150 LOC) instead of NextAuth.
> · Responsive table that morphs between card and table layouts
>   via descendant CSS variants.
> · URL-as-state for all filter / sort / pagination.

---

## Visuals to capture

When you make the portfolio page, screenshot these. Mid-2024
recruiters skim images first; copy second.

| Shot | Why |
|------|-----|
| Dashboard `?scope=org` showing the KPI grid and donut chart | Best visual density; shows breadth |
| Jobs list with the columns dropdown open | Shows the column-picker UX |
| Submission detail with the status pipeline + timeline open | Shows the audit log working |
| Interview rounds manager with a couple of rounds | Shows the rich domain model |
| `/jobs/import` preview with new/updated/errored tables | Shows the import pipeline |
| Reports page (time-to-fill or recruiter aging) | Shows analytical depth |
| Mobile view of any list page | Shows the card-layout responsive trick |

Capture against the demo seed (`tsx prisma/seed-demo.ts`) —
realistic numbers, no real PII.

---

## What to NOT say

- **Don't claim user counts you don't have.** "10-person team"
  is honest; "1000+ users" isn't.
- **Don't list features it doesn't have** — notifications, dark
  mode, real-time, mobile app. They're explicitly deferred and
  saying otherwise is the fastest way to be caught.
- **Don't say "production-grade scalable."** Say what it is:
  an internal tool built for a small team, with explicit notes
  on what would change at scale (see `docs/interview-prep/03-system-design/`).
- **Don't credit yourself with work you didn't do.** If anything
  was paired or guided, say so. "Built end-to-end" is OK only
  if it's true.

---

## Honest scope statement (use this on your portfolio if asked
about size)

> "LuminTrack is an internal tool for a 10-person recruiting
> team — it's not a SaaS, not multi-tenant, and not customer-
> facing. The decisions reflect that: hand-rolled auth, no
> queue, no Redis, last-write-wins concurrency. I made every
> trade-off deliberately, and I can explain what I'd change at
> 100× scale."

That last sentence is the move. It signals you understand
*context-driven* engineering, which is what real teams hire
for.

---

## Source references

When asked to back any claim above, the underlying handbook
docs are:

- Audit log → [`docs/handbook/09-audit-and-timeline.md`](./handbook/09-audit-and-timeline.md)
- Architecture → [`docs/handbook/03-architecture.md`](./handbook/03-architecture.md)
- Auth → [`docs/handbook/05-auth-and-sessions.md`](./handbook/05-auth-and-sessions.md)
- iLabor import → [`docs/handbook/10-imports-and-display-ids.md`](./handbook/10-imports-and-display-ids.md)
- Schema → [`docs/handbook/04-database-schema.md`](./handbook/04-database-schema.md)
- Conventions → [`docs/handbook/06-conventions.md`](./handbook/06-conventions.md)

And the interview-prep folder has the "how would I talk about
this" version of every section above.
