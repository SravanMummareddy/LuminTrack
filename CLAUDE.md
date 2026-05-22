@AGENTS.md

# LuminTrack

Internal recruitment tracking dashboard for a small recruiting team (<10 recruiters).
Tracks job requirements, candidate submissions, interview rounds, outcomes, notes, an audit
timeline, and recruiter performance. Replaces a manual Excel/Word process.

**Source of truth for requirements:** `docs/PROJECT_REQUIREMENTS.md`
**Approved build plan:** `~/.claude/plans/we-have-the-requirements-optimized-balloon.md`

## Stack (all current majors — verify APIs, don't assume older versions)

- **Next.js 16** (App Router, Turbopack) + React 19.2 + TypeScript
- **Prisma 7** + PostgreSQL on **Neon** (driver adapter `@prisma/adapter-neon`)
- **Tailwind CSS v4** — hand-rolled UI primitives in `src/components/ui/` (shadcn/ui not used)
- **Zod 4** validation, react-hook-form
- Auth: hand-rolled session (`bcryptjs` + `jose` JWT cookie) — NOT NextAuth
- Resumes = a per-candidate **résumé library** (`CandidateResume`) of labelled Google
  Drive links with inline preview; each submission picks one and snapshots its link.
  `@vercel/blob` file upload deferred until a Blob store is provisioned. Recharts (Phase 7)
- Deploy target: Vercel

## Critical version gotchas

**Next.js 16**
- Middleware is renamed `proxy` — the file is `src/proxy.ts`, exports a `proxy` function.
- `cookies()`, `headers()`, `params`, `searchParams` are ALL async — always `await` them.
- Turbopack is the default for `next dev` / `next build` (no flag needed).
- `revalidateTag` needs a second `cacheLife` arg; prefer `revalidatePath` / `refresh`.

**Prisma 7**
- The runtime client REQUIRES a driver adapter — see `src/server/db.ts` (Neon adapter).
- Connection URLs are NOT in `schema.prisma`; they live in `prisma.config.ts`
  (`datasource.url` = `DIRECT_URL` for the CLI) and `.env` (`DATABASE_URL` for the app).
- Generated client lives at `src/generated/prisma/` (gitignored) — import from
  `@/generated/prisma/client`. Run `prisma generate` after schema changes (also `postinstall`).

## Conventions

- **Mutations** = Server Actions in `src/server/actions/*`. **Reads** for Server Components
  go in `src/server/queries/*`. Pages are async Server Components.
- **DB client**: import the singleton `prisma` from `@/server/db`.
- **Audit log**: every mutating action runs its write + `logActivity()` (`src/server/activity.ts`)
  inside one `prisma.$transaction` so the change and its audit row commit atomically.
- **Validation**: Zod schemas in `src/lib/validation/*`, shared by client form + server action.
- **Auth**: `getCurrentUser()` / `requireUser()` from `@/lib/session` for the acting user.
- No hard-deletes of jobs/candidates — retire via status; org entities via `isActive`.

## Commands

```
npm run dev         # dev server (Turbopack)
npm run build       # production build
npm run db:migrate  # prisma migrate dev
npm run db:seed     # seed admin + sample data (prisma/seed.ts)
npm run db:studio   # prisma studio
```

## Environment (.env — gitignored; see .env.example)

`DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct), `AUTH_SECRET`,
`BLOB_READ_WRITE_TOKEN` (Phase 3), `SEED_ADMIN_*`.

## Build status

All 7 build phases are complete and verified:

- **Phase 1** — Foundation & Auth ✅
- **Phase 2** — Jobs & org entities ✅
- **Phase 3** — Candidates (Drive-link résumé + inline preview, duplicate warning) ✅
- **Phase 4** — Submissions (status pipeline, duplicate prevention) ✅
- **Phase 5** — Interview rounds ✅
- **Phase 6** — Timeline / audit UI + Notes ✅
- **Phase 7** — Dashboard, Reports, Recruiters, global search ✅

**Post-Phase-7 work (committed to `main`):**
- List pages (Jobs/Candidates/Submissions/Recruiters) gained clickable column
  **sorting** (`?sort=&dir=`), **10-row pagination** (`?page=`), and a **collapsible
  filter bar** — shared primitives `src/components/ui/{sortable-header,pagination,filter-bar}.tsx`;
  list queries return `{ rows, total, page }`.
- Phase 7 review bugs fixed (Dashboard "Active jobs" KPI subtitle, dead recruiter-detail
  filter, admin excluded from the Recruiters list, `$/hr` rate units, clearer timeline labels).
- **Résumé library** — each candidate keeps many labelled Google Drive résumés
  (`CandidateResume`, 1:N), managed in a section on the candidate detail page. Submitting
  a candidate picks a saved résumé or adds one inline (optional). The submission keeps
  `resumeDriveLink` as a snapshot (so history survives résumé edits/deletes) plus a
  nullable `candidateResumeId` FK; `Candidate.resumeDriveLink` was dropped. Shown on the
  submission detail (inline preview) and as a column on the job's candidate table.
- **Submission edit form** — `/submissions/[id]/edit` lets the rate, résumé, and notes
  of an existing submission be changed (candidate, job, and recruiter stay fixed at
  creation; status keeps its own form). Reuses the résumé picker via a shared
  `submissionEditSchema`; `updateSubmission` logs a new `SUBMISSION_UPDATED` audit
  action (migration `20260522020000_submission_updated_action`).
- **Status-change context** — the "Update status" form also captures an optional
  real-world event date/time, a note, and (for Rejected / On Hold) a preset reason.
  Stored on three new nullable `Activity` columns (`eventAt`, `note`, `reason`;
  migration `20260522030000_status_change_details`) and shown on the activity
  timeline. Reason presets live in `src/lib/labels.ts` as app-level strings.

## Docs & demo data

- `DEMO_GUIDE.md` (project root) — end-to-end app & workflow walkthrough for demos.
- `prisma/seed-demo.ts` wipes the DB and loads ~3 months of realistic sample data
  (8 users, 50 jobs, 30 candidates, 160 submissions). Admin login:
  `admin@lumintrack.com` / `LuminTrack2026!` (all sample recruiters share that password).
