@AGENTS.md

# LuminTrack

Internal recruitment tracking dashboard for a small recruiting team (<10 recruiters).
Tracks job requirements, candidate submissions, interview rounds, outcomes, notes, an audit
timeline, and recruiter performance. Replaces a manual Excel/Word process.

> **⚠️ iLabor / Randstad import REMOVED (2026-07-10).** Jobs are added **manually only**.
> The entire iLabor requisition-import feature was deleted — the `JobPortal` table, all
> iLabor-only Job columns, the `/jobs/import` + `/jobs/imports` routes, the import wizard,
> the source sub-tabs, and the `ilabor_closed` / `ilabor_cap` submission gates are all gone
> (migration `20260710170000_remove_ilabor`). **Any iLabor / Randstad-import / JobPortal /
> requisition-import references in DEVLOG history are obsolete — ignore them.**
> The `atsId`/`startDate`/`endDate`/`durationLabel`/`positions`/`reqType`/`department` columns
> were KEPT as generic manual job-detail fields. Vendor Portal Requirements (VPR,
> `/vendor-portal`) is a separate feature and is unaffected. **Prod migration not yet applied
> — pending owner go-ahead.** See DEVLOG 2026-07-10.

**Source of truth for requirements:** `docs/PROJECT_REQUIREMENTS.md`
**Approved build plan:** `~/.claude/plans/we-have-the-requirements-optimized-balloon.md`
**Open work / bug backlog:** `bugs.md` (top of file has a grouped "Remaining work" summary —
start there before grepping the audit sections).
**Future enhancements (large multi-session items):** [`ENHANCEMENTS.md`](./ENHANCEMENTS.md).
**Project history (round-by-round build log):** [`docs/DEVLOG.md`](./docs/DEVLOG.md) — the
"Historical build log" section at the bottom + dated Situation/Diagnosis/Fix/Lesson entries.
Consult it for *why* a feature was built the way it was; it is NOT auto-loaded.

## Architecture — three-tier pipeline

**Job → VendorRequirement (VPR, 1:many) → Submission.**
- **Job** = bare requisition (title/client/vendor/location/status/positions + Client rate only).
- **VPR** (`/vendor-portal`, "Vendor Portal Requirements") = a team-lead-scoped **planning
  layer** carrying commercial terms (Bill/Pay/engagement/team-lead), `status`
  OPEN/CONVERTED/CANCELLED. A separate `VendorRequirement` table (not Submission+status) so it
  is **invisible to all submission analytics by construction**. Team lead = `User.isTeamLead`
  flag (not a 3rd role); `canManageRequirements = ADMIN || isTeamLead`. A recruiter "moves it
  to a submission" (prefilled + editable) via the extracted `createSubmissionRecord(tx, …)`
  (`src/server/submission-create.ts`). Display id `VPR-###`.
- **Submission** = the tracked record that drives recruiter performance analytics.

Nav: **Jobs · Vendor Portal Requirements · Submissions**. Other display IDs: `JOB-…`,
`CAND-…`, `SUB-…`, `PLC-…` (placements), `BC-…` (bench), backed by `seq @unique autoincrement`.

Related lifecycles:
- **Placements** — a `Placement` auto-creates when a submission flips to JOINED; candidate
  status cascades PLACED ↔ AVAILABLE. Lifecycle helpers in `src/server/placement-lifecycle.ts`.
- **Candidate-first bench** — every bench person is a `BenchConsultant` linked 1:1 to a
  `Candidate` (`candidateId @unique`, source of truth). `marketingStatus` (On bench / Paused /
  Placed / Off bench) is the single on/off-bench axis. Helpers in `src/server/bench-lifecycle.ts`.
- **IT/Non-IT `discipline`** on Candidate + Job (bench reads its candidate's).
- **Trash/erase ladder** (Candidates + Jobs): Active → Inactive → Trash (30d) → Erased
  (backup-to-Blob first). `deletedAt`/`erasedAt`; queries filter `deletedAt: null`.
- **Résumés + Documents = private Vercel Blob uploads** (Google Drive retired). Served via
  `/api/resumes/[id]` + `/api/documents/[id]` (auth + sensitive-doc gate).

## Rate & margin model

Money flows downhill, each rung keeping a margin:
**Client rate** (what the end client releases) ≥ **Bill / Vendor rate** (what the vendor
releases to us — what we actually receive) ≥ **Pay rate** (what we pay the consultant).
Margin = bill − pay; the binding profit constraint is **Pay ≤ Bill** (we only ever receive
the bill rate). All revenue/margin math keys off **Bill − Pay**. The client's Excel tracks
only Pay rate + Bill rate; `clientRate` is nullable and often undisclosed by the vendor
(kept as optional context). The Job carries requisition-level `clientRate` + `vendorRate`
(the latter = the job-level bill rate); per-candidate `payRate`/`billRate` live on the
requirement + submission.
**Legacy `candidateRate` was RETIRED 2026-07-06** (owner-confirmed) — dropped from Job,
Submission, VendorRequirement (migration `20260706220000_retire_candidate_rate`) and removed
from all code. Do not reintroduce it.
**Source of truth:** the header comment + `rateChainWarnings()` in `src/lib/rates.ts` (chain
= Client ≥ Bill ≥ Pay); the live chain warning is `src/components/ui/rate-chain-warning.tsx`.

## Current state (2026-07-13)

- **`main` is live on prod** (`lumin-track.vercel.app`). Foundation (org/roles/tenancy Phases A/B/C
  #79–#83, independent backlog #84, Job-form/org-entity redesign #86) + the **6-form forms-discipline
  rollout** (#90/#92/#93/#94/#95/#96) + field-definition cleanup (#102) all shipped.
- **Wave 4 — strict submission pipeline** ✅ #97 (migration `20260712200000_interview_didnt_happen` on
  dev+PROD): per-stage dates SB-4, controlled transitions SB-6 (`advanceBlock` in `submission-flow.ts`),
  hard-required round fields SB-5, `InterviewResult` NO_SHOW/CANCELLED, round-tracking IV-2, min-subs
  nudge V-6. Plus **IV-1** interview schedule view.
- **Wave 5** — **V-5** received-date + time-to-first-submission ✅ #99/#100 (migration
  `20260712230000_job_received_at`) · **SRC-2** source analytics ✅ #101. SRC-1 partial (job source
  rework #86); SRC-3 gated on D9.
- **Wave 6 — C-1** original-résumé flag ✅ (`ResumeKind`, migration `20260711180000_resume_kind`).
- **Wave 7 family (email + dashboard) ✅ ALL SHIPPED:**
  - **7 notifications** #103 — Resend over plain `fetch` (`src/server/email.ts`, fails safe when
    `RESEND_API_KEY` unset); weekday **7am CST** digest cron (`/api/cron/digest`, #107); immediate
    submission→team-lead event; per-user opt-out (`User.notifyDigest`/`notifyEvents`, migration
    `20260713100000`).
  - **7.1** team-lead → recruiter **VPR-assignment email** #104 (`notifyRecruiterAssigned`, an
    "Email recruiter" button + assign-form checkbox; audit `REQUIREMENT_RECRUITER_EMAILED`, migration
    `20260713140000`). Explicit sends ignore the `notifyEvents` opt-out.
  - **7.2a/b** unified **pending-todos** — one canonical `src/server/pending.ts` (`getPendingTodos`)
    feeding **both** the dashboard "Needs attention" card and the digest, so they agree. Urgency tiers
    (overdue/soon/backlog). Dashboard scope = **me · team · org**: recruiters (me), **team leads**
    (me·team — `leadsAnyTeam`/`ledTeamMemberIds`, owner-tagged items + per-member strip), **managers/
    admins** (me·org — `getTeamRollup` cards + manager action items via `getManagerActionItems`).
    #105/#106. Phantom terminal-round todo fixed #108.
- **Bug backlog: CLEAR** (reconciled 2026-07-13) — `bugs.md` head reconciled; adversarial app-wide sweep
  found the server layer clean; integration suite is green (the old 12-failure debt was fixed #98).
- **Open owner decisions** (the only real gates left): **D5** referrer entity (→ finishes SRC-1) · **D9**
  new-vendor/closure def (→ SRC-3) · **D14** VPR-dedup scope · **D8** hosting (→ Track B: Google SSO,
  GoDaddy subdomain). D13 rate masking DECLINED. See `docs/WORKLIST.md` (top RECONCILED block).
- **Parked enhancement:** candidate/vendor **outreach** (owner parked 2026-07-13 pending bug-cleanup;
  scope questions ready). **Owner to-do:** configure Resend (domain + `RESEND_API_KEY`/`EMAIL_FROM`) for
  real delivery; a logged-in browser pass over the new dashboard.

## Stack (all current majors — verify APIs, don't assume older versions)

- **Next.js 16** (App Router, Turbopack) + React 19.2 + TypeScript
- **Prisma 7** + PostgreSQL on **Neon** (driver adapter `@prisma/adapter-neon`)
- **Tailwind CSS v4** — hand-rolled UI primitives in `src/components/ui/` (shadcn/ui not used)
- **Zod 4** validation, react-hook-form
- Auth: hand-rolled session (`bcryptjs` + `jose` JWT cookie) — NOT NextAuth
- File uploads: private **Vercel Blob** (`@vercel/blob`, gzipped before `put`). Recharts for charts.
- Deploy target: Vercel

## Critical version gotchas

**Next.js 16**
- Middleware is renamed `proxy` — the file is `src/proxy.ts`, exports a `proxy` function.
  Its matcher must exclude the whole `_next/` tree or it breaks the dev HMR WebSocket.
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
- Flatten Prisma `Decimal` fields (→ number) in queries before returning to Client Components.

## Migrations & prod deploy (non-interactive shell)

- `prisma migrate dev` is interactive — instead hand-write the SQL under
  `prisma/migrations/<ts>_<name>/`, then `prisma migrate deploy` + `prisma generate`.
  **After `generate`, RESTART the dev server** (HMR does not reload the regenerated client) —
  which also **logs you out** (session cookie), so re-login after a restart.
- **Two Neon DBs:** dev (active `.env`) and prod (`.env.neon-prod.bak`, gitignored — the DB
  Vercel prod uses). **Vercel does NOT run `migrate deploy`** — apply prod migrations manually
  against the prod `DIRECT_URL`: `set -a; . ./.env.neon-prod.bak; set +a; npx prisma migrate deploy`.

## Commands

```
npm run dev          # dev server (Turbopack)
npm run build        # production build
npm run db:migrate   # prisma migrate dev
npm run db:seed      # seed admin + sample data (prisma/seed.ts)
npm run db:studio    # prisma studio
npm test             # vitest unit suite (no DB — pure logic + mocked lifecycle)
npm run test:watch   # vitest in watch mode
npm run test:integration  # integration suite vs Dockerized Postgres (see below)
npm run test:e2e     # Playwright E2E against running app + seeded DB
```

## Testing

- **Unit suite** (`npm test`) — `vitest`, plain Node, **no database**. Pure logic
  (permissions, validation, labels exhaustiveness, analytics) + the placement lifecycle state
  machine via a **mock Prisma transaction client** (`@/server/db` is mocked so the Neon adapter
  is never built). Fast (<1s); runs on pre-commit and in CI. Lives in `src/**/__tests__/*.test.ts`.
- **Integration suite** (`npm run test:integration`) — `vitest` against a **real disposable
  Postgres** (Docker). One-time: `npm run test:db:up` (starts `postgres:16` on :5433 + applies
  migrations); then `npm run test:integration`; `npm run test:db:down` to tear down. Uses
  `@prisma/adapter-pg` against `DATABASE_URL_TEST`. Lives in `tests/integration/*.test.ts`.
  Skipped automatically if the test DB is unreachable, so it never blocks the unit suite or CI.
- **E2E suite** (`npm run test:e2e`) — **Playwright** driving real Chromium against the running
  app + seeded DB. **Contract:** app on `:3000` (`npm run dev`) + demo seed
  (`npx tsx prisma/seed-demo.ts`); specs log in as the seeded admin + recruiter. `global-setup`
  mints both sessions once (`e2e/.auth/*.json`); runs serially (`workers: 1`). Full details +
  coverage table in [`e2e/README.md`](./e2e/README.md). Reseed to restore a pristine state.

## Environment (.env — gitignored; see .env.example)

`DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct), `AUTH_SECRET`,
`BLOB_READ_WRITE_TOKEN`, `SEED_ADMIN_*`.

## Agent tooling

- **Code graph:** `codebase-memory-mcp` is the primary code-structure tool (repo is indexed).
  Prefer `trace_path` / `search_graph` / `get_code_snippet` over grep for "who calls X / what
  does X touch"; use it as a scalpel, not for broad `get_architecture` dumps.
- **Visual UI work:** Claude Code has no built-in browser. Use the Playwright MCP server
  (`claude mcp add playwright npx @playwright/mcp@latest`, then restart) to navigate the running
  dev server, screenshot rendered pages, and inspect the DOM.

## Docs & demo data

- `DEMO_GUIDE.md` (project root) — end-to-end app & workflow walkthrough for demos.
- `prisma/seed-demo.ts` wipes the DB and loads ~3 months of realistic sample data
  (11 users — 3 admins + 8 recruiters, 50 jobs, 30 candidates + linked bench consultants,
  160 submissions). Demo login: `sriman@lumintrack.com` (admin + team lead) /
  `hrishikesh@lumintrack.com` (recruiter) — all 11 users share password `LuminTrack2026!`.
