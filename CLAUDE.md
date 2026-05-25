@AGENTS.md

# LuminTrack

Internal recruitment tracking dashboard for a small recruiting team (<10 recruiters).
Tracks job requirements, candidate submissions, interview rounds, outcomes, notes, an audit
timeline, and recruiter performance. Replaces a manual Excel/Word process.

**Source of truth for requirements:** `docs/PROJECT_REQUIREMENTS.md`
**Approved build plan:** `~/.claude/plans/we-have-the-requirements-optimized-balloon.md`

## 🚧 Current work — iLabor requisition import (Phase 8b: browser extension is next)

Active build: importing Randstad iLabor requisitions into LuminTrack via a
browser-extension → JSON-file → admin-upload pipeline, plus related Jobs-page
enhancements.

**Read first:** [`ILABOR_IMPORT_HANDOFF.md`](./ILABOR_IMPORT_HANDOFF.md) — live
snapshot, file map, resolved decisions, iLabor JSON sample. The architectural
"why" lives in [`docs/PLAN_iLabor_import.md`](./docs/PLAN_iLabor_import.md).

- **Status:** Phases 0–7 done **and** the post-Phase-7 polish round shipped
  (concurrent-import lock, per-job `JOB_IMPORTED` audit + backfill, `/jobs/imports`
  history page, page-jump input, SNo on candidate/submission lists,
  `jobSourceLabel` portal fallback). Phase 8b — the browser extension in a
  separate repo — is the only piece remaining.
- **Audit follow-ups:** see [`bugs.md`](./bugs.md) — "Polish round 2"
  (2026-05-24 audit) is now **mostly shipped**: correctness items 1–6, UX
  items 8–14, dialog focus trap, error/not-found pages, mobile topbar,
  dashboard tooltips + Top-5 source bucket, Reports Joined %, sub-table
  pagination, collapsed timeline, column pickers on Candidates/Submissions
  with shared `ColumnsMenu` + keyboard reorder, plus Round 3 §A1 (manual
  job form parity for 7 iLabor columns) — all in commits 861c90f..e9d5652
  (2026-05-25). **Round 3.5 also shipped 2026-05-25**: Dashboard "Active
  jobs" subtitle tightened, Candidates Skills column hidden-by-default +
  capped at 3 chips with `+N` tooltip, new `Candidate.featuredSkills`
  star-picker (chip wall) feeding the list-view truncation, candidate
  detail Interview History replaced with grouped-by-job rows + ✓/✗/⌛
  pips + `<details>` expand, sub-tables paginate at `SUB_PAGE_SIZE = 5`
  (with `Pagination` `pageSize` prop + jump input at >3 pages), and
  `listCandidates`/`listSubmissions` now flatten Prisma `Decimal`
  fields before returning so the Client-Component tables don't crash.
  **Tier 1 pre-demo fixes shipped 2026-05-25** (commits
  `1296300..144296a`): org-entity writes (clients/vendors/sources) gated
  on admin role; `useFocusTrap` hook extracted from `Dialog` and adopted
  by `MobileNav`; `buttonClass` gains a visible focus-ring; submission
  status form uses `useTransition` for a pending button; global topbar
  search supports ↑/↓/Enter keyboard nav with combobox ARIA; new
  `?scope=me|org` Dashboard toggle (defaults to `me` for recruiters,
  `org` for admins) plus a "My work — needs attention" card driven
  by a new `getMyWork(userId)` query.
- **Process:** phase-by-phase with product-owner confirmation between phases;
  teaching-style narration of meaningful code; additive only — the existing
  dashboard's behavior is unchanged for anyone not exercising the new flow.

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

All 7 original build phases are complete and verified:

- **Phase 1** — Foundation & Auth ✅
- **Phase 2** — Jobs & org entities ✅
- **Phase 3** — Candidates (Drive-link résumé + inline preview, duplicate warning) ✅
- **Phase 4** — Submissions (status pipeline, duplicate prevention) ✅
- **Phase 5** — Interview rounds ✅
- **Phase 6** — Timeline / audit UI + Notes ✅
- **Phase 7** — Dashboard, Reports, Recruiters, global search ✅

iLabor import sub-build (additive — see `ILABOR_IMPORT_HANDOFF.md`):

- **iLabor Phases 0–3** — Recon, schema + migration, validation, server actions ✅
- **iLabor Phase 4** — `/jobs/import` admin wizard (upload → preview → confirm) ✅
- **iLabor Phase 5** — Source sub-tabs (`?source=`) + iLabor detail card ✅
- **iLabor Phase 6** — Column show/hide + drag-reorder on Jobs list (`useColumnPrefs`) ✅
- **iLabor Phase 7** — Display IDs (`JOB-00123` / `REQ-159263` / `CAND-001` / `SUB-001`) + SNo ✅
- **iLabor Phase 8a (polish)** — pg advisory lock on import, per-job `JOB_IMPORTED` audit + backfill, `/jobs/imports` history page, page-jump input, source-label portal fallback ✅
- **iLabor Phase 8b** — Browser extension (separate repo, Manifest V3) ⏳

The tolerant envelope adapter (added in Phase 4 polish) means admins can paste
raw iLabor network captures directly today — the extension is purely a UX
upgrade, not a functional gate.

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
- **iLabor bulk import (Phases 4–8a)** — `/jobs/import` admin wizard,
  `/jobs/imports` history page, source sub-tabs on the Jobs list, read-only
  iLabor requisition card on job detail, column show/hide + drag-reorder
  (`useColumnPrefs` hook + localStorage, versioned), display IDs (`JOB-00123` /
  `REQ-159263` / `CAND-001` / `SUB-001`) backed by `seq Int @unique @default(autoincrement())`
  on Job / Candidate / Submission (migration `20260524160000_display_sequences`),
  SNo column on all three lists, Pagination "Go to page N" jump (>7 pages),
  Postgres advisory lock guarding concurrent admin imports, per-job
  `JOB_IMPORTED` audit entry (enum migration `20260524180000_job_imported_action`)
  with one-off backfill script `prisma/backfill-job-imported.ts`, and
  `jobSourceLabel` portal-name fallback for imported rows.
- **Polish Round 2 (2026-05-25)** — sub-table pagination with namespaced
  query params (`?subs=` on jobs/candidates, `?ints=` on candidates,
  `?jobs=`/`?rsubs=`/`?rstatus=` on recruiters) reusing the existing
  `Pagination` component (now with an optional `paramKey` prop). Activity
  timeline became a Client Component that collapses to 5 by default and
  pages 20-at-a-time when expanded >30 entries; `getTimelineFor` capped at
  200 rows. Column pickers on `/candidates` + `/submissions` driven by a
  shared `src/components/ui/columns-menu.tsx` (drag-reorder + ↑/↓ keyboard
  buttons), replacing ~110 lines of duplication in `JobsTable`. Dialog
  focus trap + return-focus on close. Dashboard StatCard tooltips + Top-5
  source bucket + em-dash for zero-row recruiters. Reports gained a
  Joined % column per dimension. Manual job form parity for 7 nullable
  iLabor columns (positions, reqType, department, durationLabel, atsId,
  startDate, endDate) under a collapsible "More job details" section.
  `error.tsx` + `not-found.tsx` for the dashboard segment.
  Recruiter-detail status pill filter. Settings Admin Tools card.
  See commits 861c90f..e9d5652.

## Docs & demo data

- `DEMO_GUIDE.md` (project root) — end-to-end app & workflow walkthrough for demos.
- `prisma/seed-demo.ts` wipes the DB and loads ~3 months of realistic sample data
  (8 users, 50 jobs, 30 candidates, 160 submissions). Admin login:
  `admin@lumintrack.com` / `LuminTrack2026!` (all sample recruiters share that password).
