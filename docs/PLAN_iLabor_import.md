# iLabor Requisition Import & Related Enhancements — Implementation Plan

> **Status note (2026-05-24):** Phases 0–3 are complete. Phase 4 is next.
> See `ILABOR_IMPORT_HANDOFF.md` at the repo root for the live progress snapshot,
> the iLabor JSON sample, the resolved + still-open decisions, and the exact
> hand-off for whoever picks up next.
> This file is the original architectural plan — preserved verbatim for the
> "why" behind each phase.

## Context

The client receives job requisitions from Randstad's **iLabor** vendor portal, which
has **no API and no Excel export**. Today reqs are re-keyed by hand into LuminTrack
with most fields lost. This plan delivers six related improvements as one coherent
build:

1. Import requisitions from a JSON file produced by a separate browser extension.
2. A **generalized `JobPortal` model** so future external portals (not just Randstad)
   plug in without schema changes.
3. **Source sub-tabs** on the existing Jobs page: All / Manual / Randstad / Others.
4. **Column show/hide + drag-reorder** on the Jobs list (localStorage-backed).
5. **Meaningful display IDs** across Jobs / Candidates / Submissions.
6. A separate **browser extension** that captures the iLabor grid.

## Decisions locked

- **Extraction:** browser extension + file handoff. No API, no scraping.
- **Direction:** LuminTrack mirrors requisitions only; submissions stay in LuminTrack.
- **Refresh:** manual, on-demand. **Scope:** "Open" requisitions only.
- **Org mapping:** iLabor *"Customer"* (end employer) → LuminTrack **Client**;
  *"RANDSTAD"* → LuminTrack **Vendor**.
- **Upsert key:** `(portalId, portalRefId)` — generic from day one. iLabor's "Req ID"
  goes into `portalRefId`.
- **Re-import:** updates matches, adds new, leaves missing reqs untouched.
- **Capture all iLabor columns**; imported jobs are identified by `portalId != null`.
- **UI shape:** **no separate Requisitions tab.** Imported reqs live in the existing
  Jobs page, distinguished by **source sub-tabs** (All / Manual / Randstad / Others).
  UI flavor (tabs/chips on `/jobs?source=…` vs sub-routes `/jobs/randstad`) is
  deferred to Phase 5.
- **"Others" sub-tab** = jobs from any portal that isn't Randstad (empty today;
  populated when more `JobPortal` rows exist).
- **Future-proofing:** a generic `JobPortal` model. Adding "Dice", "BountyJobs", etc.
  is a row insert, not a schema change.
- **Meaningful IDs:** Jobs / Candidates / Submissions each get a sequential
  `*Number` column displayed formatted (`JOB-00123`, `CAND-001`, `SUB-001`). Imported
  jobs show the portal's external id (`REQ-158142`) where applicable. **URLs continue
  to use the CUID** (no route changes). **SNo** = the row number in the current list
  view (UI-only, no DB column).
- **Column show/hide + drag-reorder:** Jobs list only initially; preferences saved
  in **localStorage** per browser.
- **Process:** phase by phase; product owner confirms each phase before the next.
- **Additive only** — nothing already working in the dashboard breaks.
- **iLabor sub-detail pages** (clicking a Req ID for the extra-detail view) are out
  of scope.

## Phase sequence

| # | Name | Type | Status |
|---|---|---|---|
| 0 | **Recon** — inspect iLabor in DevTools, confirm how the grid data is fetched | User task, no code | ✅ DONE |
| 1 | **Schema + migration** — `JobPortal` model, `portalId`/`portalRefId` on Job, iLabor data columns, `REQUISITIONS_IMPORTED` enum, seed Randstad iLabor portal row | LuminTrack | ✅ DONE |
| 2 | **File format + Zod validation** — the import contract; per-row schema; status mapping | LuminTrack | ✅ DONE |
| 3 | **Import Server Action** — find-or-create Client + Vendor + JobPortal; upsert Jobs by `(portalId, portalRefId)`; one audit entry | LuminTrack | ✅ DONE |
| 4 | **Import UI** — upload → preview → confirm wizard at `/jobs/import` | LuminTrack | ⏭ NEXT |
| 5 | **Source sub-tabs on Jobs + detail panel** — All / Manual / Randstad / Others; iLabor panel on job detail when portal is set; new columns surfaced | LuminTrack | ⏳ |
| 6 | **Column show/hide + drag-reorder** — Jobs list only, localStorage-backed | LuminTrack | ⏳ |
| 7 | **Meaningful display IDs** — `jobNumber`, `candidateNumber`, `submissionNumber`; formatted display; SNo in lists; URLs unchanged | LuminTrack | ⏳ |
| 8 | **Browser extension** — Manifest V3 Chrome/Edge, separate repo, after recon | Separate repo | ⏳ |

## Phase 0 — Recon (prerequisite, no code) — ✅ DONE

Someone with iLabor access opens the requisition grid → DevTools → **Network** tab →
reloads → finds the request that returns requisition data. Determine: JSON? one
response for all 159 or paged? URL/shape? is the grid row-virtualised? Decides the
extension's capture method (intercept the data request vs. DOM-scrape).

**Resolved:** Data comes from a JSON endpoint named `showrequisitionslist`. Response
shape mirrors DataTables server-side pagination: `{ countReq, iTotalDisplayRecords,
iTotalRecords, requisitionViewList: [...] }`. The extension can intercept that
response (preferred over DOM scrape). Full field list captured in
`ILABOR_IMPORT_HANDOFF.md`.

## Phase 1 — Schema + migration — ✅ DONE

In `prisma/schema.prisma`:

```prisma
// New model — the source/portal a job came from.
model JobPortal {
  id        String   @id @default(cuid())
  name      String   @unique           // "Randstad iLabor", "BountyJobs", etc.
  kind      String?                    // free label — "VMS", "Job board", …
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  jobs      Job[]
}

// Add to existing Job model (all nullable; existing rows untouched):
  portalId            String?
  portal              JobPortal? @relation(fields: [portalId], references: [id])
  portalRefId         String?            // external id (iLabor "Req ID", etc.)

  atsId               String?
  startDate           DateTime?
  endDate             DateTime?
  durationLabel       String?
  positions           Int?
  externalSubsCount   Int?
  externalActiveCount Int?
  releasedDate        DateTime?
  assignedToName      String?
  ownerName           String?
  ownerAltEmail       String?
  reqType             String?
  department          String?
  externalStatusRaw   String?
  externalCreatedDate DateTime?
  lastImportedAt      DateTime?

  @@unique([portalId, portalRefId])
  @@index([portalId])
```

Add `REQUISITIONS_IMPORTED` to the `ActivityAction` enum.
Reuse the existing `vendorRate` for iLabor's "C2C" rate.

Migration: `npx prisma migrate dev --name jobportal_and_requisition_fields` —
**implementation note:** sandbox/non-interactive shell tripped on a benign
"unique-constraint warning" prompt, so we hand-wrote the SQL at
`prisma/migrations/20260524142554_jobportal_and_requisition_fields/migration.sql`
and applied it with `prisma migrate deploy`. Output is identical to what `migrate
dev` would produce.

Seed: one `JobPortal` row with `name = "Randstad iLabor"` (the import action
defensively upserts it too, so the import works on a fresh DB).

## Phase 2 — Integration file format + Zod validation — ✅ DONE

`src/lib/import/ilabor-format.ts` — the agreed JSON envelope between extension and
app (`source`, `version`, `capturedAt`, `rows: [...]`). Dependency-free so it can
be copy-pasted to the extension repo.

`src/lib/validation/ilabor-import.ts`:
- `ilaborRowSchema` — per-row Zod. Field names mirror iLabor's
  `requisitionViewList[]` exactly. Dates accept ISO strings (`z.coerce.date()`),
  `c2crate` accepts number or stringified currency. `.passthrough()` preserves
  iLabor's extra fields.
- `ilaborFileSchema` — envelope: `source` literal, pinned version, capturedAt,
  rows-as-unknown[] (per-row validated downstream so one bad row doesn't abort).
- `ilaborStatusToJobStatus()` — `Open→OPEN`, `On Hold→ON_HOLD`, `Filled→FILLED`,
  `Closed→CLOSED`, `Cancelled→CANCELLED`, `Not Filled→OPEN` (lean — confirm on
  first real import). Unknown values → OPEN with `unknown: true` warning flag.

## Phase 3 — Import Server Action — ✅ DONE

`src/server/actions/ilabor-import.ts`:
- `previewRequisitions(prev, formData)` — `requireUser()` + admin guard, parse,
  validate, classify NEW vs UPDATE, return counts + error rows. No writes.
- `importRequisitions(prev, formData)` — re-validate; one `prisma.$transaction`
  (`{ timeout: 60_000 }`):
  - Upsert the `JobPortal` row for "Randstad iLabor".
  - **Dedupe-upsert** all unique vendor + client names (so 300 rows trigger ~50
    upserts, not ~600).
  - Per row: `tx.job.upsert({ where: { portalId_portalRefId: { … } },
    create: {…with status mapping + createdById}, update: {…iLabor-owned fields
    only, status preserved, lastImportedAt} })`.
  - Rows absent from the file are not touched.
  - One `REQUISITIONS_IMPORTED` audit entry (job-less; bulk action). `newValue`
    is JSON with counts + capturedAt for later inspection.
  - `revalidatePath("/jobs")`.
- **Auth:** admin-only. Recruiters get an error response in both actions.
- **Re-import preserves manually-edited status** — `status` is set only on
  create, omitted on update. `externalStatusRaw` always refreshes.

## Phase 4 — Import UI — ⏭ NEXT

`src/app/(dashboard)/jobs/import/page.tsx` (Server Component shell) +
`src/components/jobs/import-requisitions.tsx` (Client Component wizard). File
picker → `previewRequisitions` → summary cards (new / updated / skipped) + errors
table → "Confirm import" → `importRequisitions` → redirect to `/jobs` with the
Randstad sub-tab active.

The page shell must guard with `requireUser()` + `role === "ADMIN"`. Add an
"Import from iLabor" entry to the Jobs page header, visible to admins only.

## Phase 5 — Source sub-tabs on Jobs + detail panel

UI flavor decided at implementation (tabs/chips with `?source=` query param vs.
sub-routes like `/jobs/randstad`). Source values driven by the data:
- **Manual** — `portalId IS NULL`
- **Randstad** — `portalId = (id of "Randstad iLabor" JobPortal)`
- **Others** — `portalId IS NOT NULL` AND name ≠ "Randstad iLabor" (empty today;
  populated when new `JobPortal` rows exist)
- **All** — no filter.

`src/server/queries/jobs.ts` — extend `listJobs()` to accept a `source` filter.
`src/components/jobs/job-filters.tsx` — render the sub-tabs/chips.
`src/app/(dashboard)/jobs/[id]/page.tsx` — add an "iLabor requisition" panel (Req
ID, ATS ID, start/end, duration, positions, type, dept, owner, last imported) shown
only when `portalId` is set; extend `getJobDetail`'s `select`.

## Phase 6 — Column show/hide + drag-reorder

Just on the Jobs list (`/jobs`). Add `@dnd-kit/sortable`. A "Columns" button next to
the filter bar opens a popover with: checkboxes for show/hide + drag handles for
order. Selected columns persist in `localStorage` keyed by `"lumintrack:jobs:cols"`.
The table reads that state and renders columns dynamically (with sensible defaults
on first load).

Out of scope: applying this to Candidates / Submissions / Recruiters lists, or
syncing per-user across devices via the DB. Either can be added later.

## Phase 7 — Meaningful display IDs

Schema additions:
```prisma
model Job        { jobNumber       Int @unique @default(autoincrement()) }
model Candidate  { candidateNumber Int @unique @default(autoincrement()) }
model Submission { submissionNumber Int @unique @default(autoincrement()) }
```

Display helpers in `src/lib/labels.ts`:
- `displayJobId(job)` — returns `REQ-{portalRefId}` when set, else `JOB-{padded jobNumber}`.
- `displayCandidateId(c)` — `CAND-{padded candidateNumber}`.
- `displaySubmissionId(s)` — `SUB-{padded submissionNumber}`.

Surface these IDs in list tables (a new ID column), detail pages, the timeline /
audit entries, and global search results.

Add an **SNo** column to list tables: just `(page - 1) * pageSize + rowIndex + 1`,
no DB change.

**URLs stay on the CUID** — no route changes. (We can revisit if you want
`/jobs/JOB-00123` later; that's a bigger refactor.)

## Phase 8 — Browser extension (separate repo, after Phase 0)

Manifest V3 Chrome/Edge extension:
- Content script on the iLabor requisition page; toolbar/popup button "Export
  requisitions".
- **Capture:** preferred — intercept the grid's data request/response (all rows,
  all fields, structured, immune to virtualisation); fallback — DOM-scrape.
- **Normalise** into Phase 2's envelope and **download** as `.json`.
- No credentials stored; ToS-defensible because it only reads what the logged-in
  recruiter can already see.
- Distribution: if the client is on Google Workspace, force-install via the Admin
  console; otherwise manual install for <10 recruiters.

## Open decisions (to confirm at the relevant phase)

- ~~**"Not Filled"** status → `OPEN` (alternative: `CLOSED`). [Phase 2]~~ —
  implemented as `OPEN`; revisit if first real import suggests otherwise.
- ~~**C2C → vendorRate** assumes C2C is the vendor-side rate. [Phase 2]~~ —
  confirmed by JSON sample; implemented.
- ~~**migrate vs `db push`** — the migrations folder is empty. [Phase 1]~~ —
  resolved: folder had prior migrations; used the SQL-file route as workaround
  for the non-interactive prompt.
- ~~**Who can import** — admin-only, or any recruiter? [Phase 3/4]~~ — confirmed
  admin-only (2026-05-24).
- ~~**Re-import & status** — should a re-import overwrite a manually-changed
  status? [Phase 3]~~ — implemented as "preserve LuminTrack's status on update".
- **Sub-tab UI flavor** — tabs/chips on one route vs. separate sub-routes. [Phase 5]
- **ID format details** — `JOB-00123` vs `JOB-2026-00123`; padding width. [Phase 7]

## Verification

After Phases 1–4, hand-craft `sample-ilabor.json` (~6 rows: a "Not Filled" row, a
duplicate Req ID, a row missing `customer`, a row whose Req ID matches an existing
job). Then: `npm run dev` → `/jobs/import` → upload → check preview counts + error
rows → confirm. Verify new Client + Randstad Vendor + Randstad iLabor JobPortal rows
were created, jobs appear under the Randstad sub-tab (Phase 5), the detail panel
shows iLabor fields, and the `REQUISITIONS_IMPORTED` activity is logged. Re-upload
to confirm upsert (no duplicates, manual fields preserved). `npm run build` to
type-check.

After Phase 6: try toggling and reordering Jobs columns; reload to confirm persistence.
After Phase 7: confirm formatted IDs appear in lists, detail pages, and the timeline;
imported jobs show `REQ-…`; SNo numbers rows correctly.

Phase 8 verifies end-to-end against the live iLabor portal after Phase 0 recon.
