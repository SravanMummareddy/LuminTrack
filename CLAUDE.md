@AGENTS.md

# LuminTrack

Internal recruitment tracking dashboard for a small recruiting team (<10 recruiters).
Tracks job requirements, candidate submissions, interview rounds, outcomes, notes, an audit
timeline, and recruiter performance. Replaces a manual Excel/Word process.

**Source of truth for requirements:** `docs/PROJECT_REQUIREMENTS.md`
**Approved build plan:** `~/.claude/plans/we-have-the-requirements-optimized-balloon.md`
**Open work / bug backlog:** `bugs.md` (top of file has a grouped
"Remaining work" summary — start there before grepping the audit sections).
**Future enhancements (large multi-session items):** [`ENHANCEMENTS.md`](./ENHANCEMENTS.md).

## 🚧 Current work — Round 4 pre-demo (Documents → Placements → Export)

Admin handed over a new pre-demo requirements bundle on 2026-05-28.
The full plan + UI/UX shape + code-review fixes live in
`~/.claude/plans/expressive-whistling-hedgehog.md`.

- **R4.1 — Candidate documents library: SHIPPED 2026-05-28.**
  Per-candidate `CandidateDocument` model (4 categories: Identity,
  Work Auth, Education, Employment; the first two gated to admin via
  `src/lib/permissions.ts`), Google-Drive-link storage matching
  `CandidateResume`, optional issued / expiry dates, expiry color
  pills (slate / amber / red) and a Deel-style "expiring within 30
  days" banner. Mounted on `/candidates/[id]` between résumés and
  submissions; Dashboard "Needs attention" card gained a third sub-
  section "Documents expiring (30 days)" scoped by `?scope=me|org`.
  Audit log: `CANDIDATE_DOCUMENT_ADDED / UPDATED / REMOVED` (migration
  `20260528183656_r4_1_candidate_documents`).
- **R4.2 — Placements tab: SHIPPED 2026-05-28.**
  Auto-creates a `Placement` row when a submission status flips to
  JOINED (`PlacementStatus`: ACTIVE / EXTENDED / ENDED /
  TERMINATED), with `billRate` / `payRate` `Decimal(12, 2)`,
  extensions via `PlacementExtension` rows (overlap-blocked by Zod,
  edit-only), end-of-placement card with reason + optional
  replacement-submission picker (named relation
  `"PlacementReplacement"`), and a candidate-lifecycle cascade:
  Candidate.status auto-flips to PLACED on JOINED and back to
  AVAILABLE when no other ACTIVE/EXTENDED placements remain (logged
  via `CANDIDATE_STATUS_CHANGED`). Reverting a JOINED submission
  marks the placement TERMINATED with a system endNote rather than
  hard-deleting (no-hard-delete project norm). Concurrent-JOINED
  race protected by `submissionId @unique` + a P2002 no-op catch.
  Rate edits gated to admin OR submission's recruiter-of-record
  (`src/server/actions/placements.ts`); list page masks rates for
  ineligible viewers. Lifecycle helpers extracted into
  `src/server/placement-lifecycle.ts` and reused by both
  submissions.ts and placements.ts. New `/placements` list with
  sticky summary strip (active count · weekly margin · ending in
  14d), default ACTIVE filter, ColumnsMenu (Recruiter hidden by
  default), and `PLC-001` display IDs. Detail page at
  `/placements/[id]` has a summary grid, details card, extension
  history mini-cards + inline Extend popover, and an
  end-of-placement card that only renders when the placement is no
  longer ACTIVE. Reports gained "Active placements + projected
  margin" (Σ (bill − pay) × 8h × remaining-days, 90-day fallback
  for open-ended, amber when < 15%, red when negative). Dashboard
  "Needs attention" gets a "Placements with rates pending"
  sub-list (admin + org scope only). Candidate detail shows a
  "Currently placed" pinned card while ACTIVE and a "Placement
  history" sub-table for past ones. Backfill via
  `npx tsx prisma/backfill-placements.ts` (idempotent). Migrations:
  `20260528193426_placements_and_extensions` (tables + enums) +
  `20260528193550_placement_audit_actions` (`PLACEMENT_*` and
  `CANDIDATE_STATUS_CHANGED` enum value adds — split because
  Postgres can't add enum values and use them in one transactional
  migration).
- **R4.3 — Manual data export: SHIPPED 2026-05-28.**
  Two Route Handlers under `src/app/api/export/`: `full/route.ts`
  returns a restore-grade JSON dump of every table (User rows have
  `passwordHash` stripped); `excel/route.ts` builds a multi-sheet
  `.xlsx` via `exceljs` with two modes — `business` (no PII, no
  rates, no Identity/Work Auth documents, no résumé Drive links,
  no activity log) and `full` (admin-only — everything). Shared
  builders live in `src/server/exporters/` (`build-backup-json.ts`,
  `build-business-excel.ts`) so the deferred R4.4 cron can reuse
  them. Admin-only `/settings/export` page has a segmented mode
  toggle, grouped entity checkboxes (Operational / Reference /
  Sensitive — Sensitive group hidden in business mode), live
  pre-flight summary driven by `getBackupPreflight()`, two
  download buttons (Excel primary, JSON full-mode only), and an
  Export history table reading the last 20 `DATA_EXPORTED` audit
  rows. Each export logs `DATA_EXPORTED` with a `mode=…;format=…;
  entities=…;bytes=…` note. Migration
  `20260528200000_data_exported_action` adds the enum value.
- **R4.4 — Scheduled Drive backup: deferred to post-demo.**
- **Pre-demo polish round (2026-05-28, commits `ae4847f..03fede5`):**
  surgical fixes surfaced during a scenario sweep + data-driven
  re-import deep dive.
  - **Placement reactivation on re-JOINED** (`ae4847f`):
    `ensurePlacementOnJoined` now finds-then-reactivates a
    TERMINATED/ENDED placement before falling through to create,
    logging `PLACEMENT_UPDATED note=reactivated`. Closes the
    inconsistent-state path where reverting JOINED → re-applying
    JOINED left the candidate flagged PLACED with zero ACTIVE
    placements.
  - **Candidate-status guard** (`ae4847f`): `updateCandidate`
    blocks manual status edits away from PLACED while an ACTIVE/
    EXTENDED placement exists. The lifecycle helper owns PLACED ↔
    AVAILABLE transitions.
  - **Replaces-pill on placement detail** (`018fc6e`):
    `getPredecessorPlacement(submissionId)` finds the prior
    placement that picked this submission as a replacement; the
    detail page header shows "Replaces PLC-007 (Jane Doe)".
  - **Expiring-docs banner on placement detail** (`018fc6e`):
    `getExpiringDocumentsForCandidate` surfaces a candidate's
    documents expiring within 30 days as an amber banner on the
    placement page while ACTIVE — compliance signal where it
    matters, not just hidden on the candidate page.
  - **Restore-from-backup script** (`a878f00`):
    `prisma/restore-from-backup.ts`. Dry-run by default; `--confirm`
    wipes + re-inserts every table from a backup JSON in FK-safe
    order. User rows get a placeholder password hash and
    `isActive=false` so login is blocked until reset. Makes the
    "restore-grade" claim on the JSON dump actually true.
  - **Streaming Excel export** (`a878f00`, `ef95d13`):
    `buildBusinessExcel` → `streamBusinessExcel` (returns a Node
    `Readable` via `ExcelJS.stream.xlsx.WorkbookWriter`); route
    handler returns `Readable.toWeb(stream)` so large workbooks
    no longer hold the whole file in memory. `buildBusinessExcelBuffer`
    kept for the deferred R4.4 cron. Worksheet `views` must go in
    the `addWorksheet` options bag — the streaming writer rejects
    `ws.views = ...` as read-only.
  - **Reports `<thead>` fix** (`3425b90`): `CollapsibleTable` now
    wraps the `head` row in `<thead>`; bare `<tr>` inside `<table>`
    was tripping React's hydration warning on `/reports`.
- **iLabor re-import hardening (2026-05-28, commits
  `a1aa862..03fede5`):** data-driven gap closure on what else
  could go wrong on a re-import. See `ENHANCEMENTS.md` "Round 4
  follow-ups" for the remaining medium/low items.
  - **3 iLabor signal fields captured** (`a1aa862`, migration
    `20260528210000_ilabor_signal_fields`): nullable `Job.submitLimit`
    (always 30 in sample), `Job.ilaborSubmitOpen` (0 = iLabor closed
    for subs, 1 = accepting; 52/306 rows = 0), `Job.ilaborScreenerCode`
    (>0 means screener attached; 33/306 rows = 3). Job detail iLabor
    card now renders Accepting / "Submissions closed at iLabor" pill
    next to the iLabor subs count, Submission cap row, and a
    "Screening required" amber badge. "Department" row hidden when
    the value is "Default" (all 306 sample rows).
  - **Soft submission gates** (`a1aa862`): `createSubmission`
    gained two `needsConfirm` paths reusing the duplicate-override
    pattern — `ilabor_closed` (when `ilaborSubmitOpen === 0`) and
    `ilabor_cap` (when `max(externalActiveCount, local active
    count) >= submitLimit`). Override field is `ilaborOverrideReason`;
    the `CANDIDATE_SUBMITTED` audit note composes from up to two
    triggers, joined by "; ".
  - **Preview drift detection** (`962e861`): `RowDigest` gained
    `titleDrifted` / `customerDrifted` / `existing*` fields; the
    preview shows red "title changed" / "client changed" badges on
    updated rows and a top-of-preview red banner with the drifted
    count. The per-job `JOB_UPDATED` audit row that already fired
    for client/vendor relinks now also fires on title change, with
    a unified diff in the description.
  - **4 re-import guards** (`03fede5`):
    1. **Intra-batch Req ID dedup** — `validateRows` skips duplicate
       `requisitionId`s within a single file and emits a per-row
       "Duplicate requisitionId" error so the dropped row appears
       in the skipped list.
    2. **Effective active count** — job detail card shows
       `max(externalActiveCount, local non-terminal sub count)`
       instead of iLabor's stale snapshot; amber inline note shows
       the iLabor value when they diverge.
    3. **Disappeared-from-iLabor signal** — new `listStaleIlaborJobs`
       query surfaces portal-linked jobs still OPEN/ON_HOLD whose
       `lastImportedAt` predates the most recent
       `REQUISITIONS_IMPORTED` audit row; `/jobs/imports` renders
       them as an amber "Stale iLabor jobs" section.
    4. **Case-insensitive Vendor/Client match** — `findFirst({mode:
       "insensitive"})` → create-if-missing replaces the exact-name
       upsert. "RANDSTAD" and "Randstad" now reuse the same row;
       previously the rename created orphan rows. Preview lists
       net-new vendor/client names so a true rename ("RANDSTAD" →
       "Randstad Technologies") is visible before commit.

## iLabor requisition import (Phase 8b: browser extension is next)

Active build: importing Randstad iLabor requisitions into LuminTrack via a
browser-extension → JSON-file → admin-upload pipeline, plus related Jobs-page
enhancements.

**Read first:** [`ILABOR_IMPORT_HANDOFF.md`](./ILABOR_IMPORT_HANDOFF.md) — live
snapshot, file map, resolved decisions, iLabor JSON sample. The architectural
"why" lives in [`docs/PLAN_iLabor_import.md`](./docs/PLAN_iLabor_import.md).

> **✅ Fix shipped (2026-05-28) — iLabor import "expired transaction".**
> The 306-row sample import used to crash with a Prisma "expired
> transaction" error inside `logActivity`. Root cause was the single
> 60s interactive `$transaction` wrapping the whole import in
> `src/server/actions/ilabor-import.ts` — not `logActivity` itself.
> Now split into a session-scoped `pg_try_advisory_lock` +
> un-wrapped prep + per-row mini `$transaction(job.upsert + audit)` +
> un-wrapped summary audit. See `docs/DEVLOG.md` for the full story.

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
- **Post-demo polish shipped 2026-05-25** (commits `3cd010c..ea73c31`):
  optional `meetingLink` URL on `InterviewRound` (migration
  `20260525120000_interview_meeting_link`) with form input + "Join"
  link on round cards and the candidate interview-history sub-table;
  candidate interview-history switched from a cramped `<table>` to
  per-round mini-cards (mirrors `interview-rounds-manager.tsx`
  pattern), and the collapsed group row reorganized into a two-cluster
  layout — `Job · Client` on the left, `[status] [pips] date See details`
  on the right — fixing the "stacked at narrow widths" complaint.
- **Narrow-width hardening (2026-05-25, commits `3683f2f`, `596bd9b`):**
  the interview-history summary row's two clusters now wrap as *units*
  at every viewport tested (1280 → 360 px). The `·` separator binds to
  the client name in a single inline-flex span, and the date + "See
  details ▾" toggle share a `whitespace-nowrap` span so they never
  orphan. Pip row tightened to `flex-nowrap` (capped at 5 so width is
  bounded). Verified with Playwright MCP screenshots.
- **Medium-bug sweep shipped 2026-05-26** (PRs #6 / #7 / #8):
  - **§B4 + §E2 + §E3 + §E4** — `Candidate.status` (CandidateStatus enum:
    AVAILABLE / PLACED / NOT_INTERESTED / DO_NOT_CONTACT, separate from
    `isActive`), `tags[]` (lowercased free-form labels), `lastContactedAt`
    (bumped explicitly via new `markCandidateContacted` action + new
    `CANDIDATE_CONTACTED` audit), `source` (free-text origin). Migration
    `20260526140000_candidate_status_tags_contact_source` + companion
    `20260526145000_restore_array_defaults`. Candidate form gets the four
    inputs; detail page surfaces status badge + source + last-contacted
    row + tag chips.
  - **§D5 + §C4** — `InterviewRound.scheduledTimezone` (IANA string,
    UTC `scheduledAt` unchanged); dropped `@@unique([candidateId, jobId])`
    on Submission and replaced the DB block with an action-layer duplicate
    check that captures `duplicateReason` and a custom audit note when
    overridden. Migration `20260526150000_interview_tz_and_dup_override`.
  - **§F3 + §F4 + §J2** — `/reports` gained a "Recruiter aging" table
    (submissions >14 days still in early pipeline stages) + a "Client
    revenue projection" table (`Σ candidateRate × 8h × duration ×
    positions` for OPEN/ON_HOLD jobs, 90-day default duration when
    start/end dates missing). New admin-only `/audit` route — org-wide
    activity log filterable by action + user, paginated 25/page, linked
    from Settings → Admin tools. No migration.
- **§F2 funnel velocity shipped 2026-05-26** (PR #11): `/reports` gained
  a "Time to fill" card (median + p90 days from `Job.createdAt` to a
  JOINED submission, overall + by client + by source) and a "Time in
  stage" table (median + p90 days each submission sits in each
  non-terminal pipeline status, walked from `SUBMISSION_STATUS_CHANGED`
  audit rows). No migration. New `median()` / `percentile()` helpers in
  `src/server/queries/reports.ts`.
- **iLabor signal fields shipped 2026-05-28**: data-driven gap closure
  after a fill-rate scan over the 306-row sample. New nullable columns
  on `Job` — `submitLimit` (iLabor's per-req max), `ilaborSubmitOpen`
  (0 = iLabor closed for subs, 1 = accepting; raw int preserved for
  unknown values), and `ilaborScreenerCode` (>0 means a screener is
  attached). iLabor card on `/jobs/[id]` now shows an Accepting /
  "Submissions closed at iLabor" pill next to the iLabor subs count,
  a "Submission cap" row, and a "Screening required" amber badge
  when a screener is attached. The "Department" row is hidden when
  the value is literally "Default" (all 306 sample rows). `createSubmission`
  gained two soft warnings reusing the existing duplicate-override
  pattern: `ilabor_closed` fires when iLabor stopped accepting subs,
  `ilabor_cap` fires when `max(externalActiveCount, local active
  count) ≥ submitLimit`. Both override with a reason field
  (`ilaborOverrideReason`) appended to the `CANDIDATE_SUBMITTED`
  audit note as `ilabor-override:<reason>`. Manual job form
  unchanged — these are iLabor system signals. Migration
  `20260528210000_ilabor_signal_fields`.
- **Remaining large items moved to [`ENHANCEMENTS.md`](./ENHANCEMENTS.md):**
  §J1 PII export → iLabor 8b extension → §J3 admin 2FA → §E1 résumé
  parsing → §J4 session inspector. **§G1-G3 (notifications) and §I4
  (dark mode) are deferred indefinitely on user direction.**
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

## Agent tooling — Playwright MCP for visual UI work

Claude Code has **no built-in browser**; the agent can only read source
files. For iterative UI polish (e.g. the candidate interview-history
layout work on 2026-05-25), enable the official Playwright MCP server
so the agent can navigate the running dev server, screenshot rendered
pages, and inspect the DOM:

```
claude mcp add playwright npx @playwright/mcp@latest
```

Then restart Claude Code. Tools like `mcp__playwright__browser_navigate`
and `mcp__playwright__browser_screenshot` become available. Typical
loop: run `npm run dev`, ask the agent to navigate to the page, take
a screenshot, then iterate. Without this, UI feedback is "user
screenshots a page → drops it in `uploads/` → agent reads the image".

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
