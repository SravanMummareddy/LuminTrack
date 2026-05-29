# 00 — Start here

> **In plain English.** LuminTrack is a tiny internal website that a
> small recruiting team uses to track who they're trying to hire,
> who they've sent in, and what happened. This handbook is the
> "intern induction pack" — read it top to bottom and you'll
> understand the whole app: every screen, every button, every
> framework decision.

## Who this handbook is for

- A new engineer joining the project who has never seen the codebase.
- The product owner who wants to understand *why* the code looks the
  way it does.
- Future-you in six months, when you've forgotten the details.

You're expected to know JavaScript/TypeScript and have *heard of*
React and SQL. You are **not** expected to know Next.js 16,
Prisma 7, Tailwind v4, or any of the project-specific concepts
(Submission, Round, iLabor, Source). Those are all explained here.

## How to run it locally

```bash
# 1. Install
npm install

# 2. Set up env (copy .env.example → .env and fill in)
cp .env.example .env
# Required: DATABASE_URL (Neon pooled), DIRECT_URL (Neon direct),
#           AUTH_SECRET, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD

# 3. Migrate and seed
npm run db:migrate
npm run db:seed          # bare admin + a few samples
# OR
tsx prisma/seed-demo.ts  # wipes + loads ~3 months of realistic data

# 4. Run
npm run dev              # http://localhost:3000
```

Demo admin login (after `seed-demo`): `admin@lumintrack.com` /
`LuminTrack2026!`.

## Reading order

Read the docs in this order. Each builds on the last.

### Part 1 — Orientation (~30 min)

1. [`01-what-is-lumintrack.md`](./01-what-is-lumintrack.md) — the
   product, the users, the problem it replaces.
2. [`02-tech-stack.md`](./02-tech-stack.md) — every dependency and
   why we picked it.
3. [`06-conventions.md`](./06-conventions.md) — the rules of the
   codebase: where reads go, where writes go, what's banned.

### Part 2 — How the app is built (~45 min)

4. [`03-architecture.md`](./03-architecture.md) — Server Components,
   Server Actions, queries, the request lifecycle.
5. [`04-database-schema.md`](./04-database-schema.md) — every table.
6. [`05-auth-and-sessions.md`](./05-auth-and-sessions.md) — login,
   the cookie, role gates.
7. [`09-audit-and-timeline.md`](./09-audit-and-timeline.md) — the
   single most important invariant: *every write is audited atomically*.

### Part 3 — The toolbox (~30 min)

8. [`07-ui-primitives.md`](./07-ui-primitives.md) — Table, Dialog,
   Pagination, FilterBar, ColumnsMenu.
9. [`08-validation-and-forms.md`](./08-validation-and-forms.md) — Zod
   schemas, react-hook-form, Server-Action round-trip.
10. [`10-imports-and-display-ids.md`](./10-imports-and-display-ids.md) —
    display IDs (`JOB-00123`), iLabor import pipeline, advisory lock.

### Part 4 — Every workflow (~60 min)

Each `workflows/*.md` file follows the same template (plain-English
summary → screens → every button → code map → why we built it
this way). Read them in any order, but the listed order tracks how
a real user encounters the app.

11. [`workflows/01-sign-in-and-nav.md`](./workflows/01-sign-in-and-nav.md)
12. [`workflows/02-dashboard.md`](./workflows/02-dashboard.md)
13. [`workflows/03-jobs.md`](./workflows/03-jobs.md)
14. [`workflows/04-candidates.md`](./workflows/04-candidates.md)
15. [`workflows/05-submissions.md`](./workflows/05-submissions.md)
16. [`workflows/06-interview-rounds.md`](./workflows/06-interview-rounds.md)
17. [`workflows/07-notes.md`](./workflows/07-notes.md)
18. [`workflows/08-reports.md`](./workflows/08-reports.md)
19. [`workflows/09-audit-page.md`](./workflows/09-audit-page.md)
20. [`workflows/10-recruiters.md`](./workflows/10-recruiters.md)
21. [`workflows/11-settings-and-admin.md`](./workflows/11-settings-and-admin.md)
22. [`workflows/12-ilabor-import.md`](./workflows/12-ilabor-import.md)
23. [`workflows/13-global-search.md`](./workflows/13-global-search.md)

### Part 5 — Reference

24. [`99-glossary.md`](./99-glossary.md) — every project term:
    "submission" vs "candidate", "source" vs "vendor" vs "client",
    "round", "portal", "advisory lock".
25. [`99-faq-gotchas.md`](./99-faq-gotchas.md) — the Next 16 / Prisma 7
    quirks that bit us at least once.

## Conventions of the handbook

- **Plain English first.** Every doc opens with a quoted summary in
  layman's terms.
- **No screenshots.** Buttons and screens are described in prose so
  the docs don't go stale when the UI tweaks.
- **File paths, not line numbers.** Code shifts; paths and symbol
  names are stabler signposts.
- **"Why" matters.** Most docs end with a "why we built it this way"
  section, often citing the specific bug or feedback that led to the
  decision.

## When the handbook and the code disagree

The code is the source of truth. Open a PR to fix the handbook.
