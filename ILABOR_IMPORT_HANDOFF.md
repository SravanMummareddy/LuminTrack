# iLabor Import — Handoff Snapshot

> **This file exists so a fresh Claude session (or a new teammate) can pick up
> the iLabor import build with zero context-switching cost.** It captures the
> live state, the resolved decisions, the file map, and exactly what to do next.
>
> **For the architectural why** (why a `JobPortal` model, why file handoff vs API,
> etc.), see [`docs/PLAN_iLabor_import.md`](./docs/PLAN_iLabor_import.md).

---

## 1. Status snapshot (2026-05-24)

| Phase | What it delivers | Status |
|---|---|---|
| 0 | iLabor recon — confirm how the grid is fetched | ✅ done — JSON endpoint `showrequisitionslist`, captured field list (§5) |
| 1 | Prisma schema + migration: `JobPortal` model, 18 new `Job` cols, `REQUISITIONS_IMPORTED` enum | ✅ done — migrated & seeded on Neon dev DB |
| 2 | File-format contract + Zod row/envelope validation + status mapping | ✅ done |
| 3 | Server Actions `previewRequisitions` + `importRequisitions` (admin-only, transactional) | ✅ done |
| 4 | Import UI wizard at `/jobs/import` (upload → preview → confirm) | ⏭ **NEXT** |
| 5 | Source sub-tabs on Jobs (All / Manual / Randstad / Others) + iLabor detail panel | ⏳ pending |
| 6 | Column show/hide + drag-reorder on Jobs list (localStorage) | ⏳ pending |
| 7 | Meaningful display IDs across Jobs / Candidates / Submissions (`JOB-00123`, `REQ-159263`, …) + `SNo` column | ⏳ pending |
| 8 | Browser extension (separate repo, Manifest V3) | ⏳ pending |

**Nothing in the existing dashboard has changed.** All additions are gated behind
a route (`/jobs/import`) that doesn't exist yet, plus new nullable columns that
nothing reads. The app behaves identically for anyone not exercising the new flow.

---

## 2. Files added or changed in Phases 1–3

```
prisma/
├─ schema.prisma                              [MODIFIED]  +JobPortal model, +18 Job cols, +REQUISITIONS_IMPORTED enum
├─ seed.ts                                    [MODIFIED]  +Randstad iLabor JobPortal upsert
└─ migrations/
   └─ 20260524142554_jobportal_and_requisition_fields/
      └─ migration.sql                        [NEW]       hand-written (workaround for non-interactive shell)

src/
├─ lib/
│  ├─ import/
│  │  └─ ilabor-format.ts                     [NEW]       envelope contract — dep-free, copy-pasteable to extension repo
│  └─ validation/
│     └─ ilabor-import.ts                     [NEW]       Zod schemas + status mapper
└─ server/
   └─ actions/
      └─ ilabor-import.ts                     [NEW]       previewRequisitions + importRequisitions
```

All files compile clean — `npx tsc --noEmit` passes.

---

## 3. Decisions — resolved

| Decision | Resolution | Set in |
|---|---|---|
| Extraction method | Browser extension + JSON file handoff (no API, no scraping) | — |
| Upsert key | `(portalId, portalRefId)` composite unique on `Job` | Phase 1 |
| Vendor mapping | iLabor's `clientName` ("RANDSTAD") → LuminTrack **Vendor**; per-row find-or-create | Phase 3 |
| Client mapping | iLabor's `customerName` → LuminTrack **Client**; per-row find-or-create | Phase 3 |
| C2C → rate | `c2crate` → `Job.vendorRate` (confirmed by JSON sample — already a number) | Phase 3 |
| "Not Filled" status | Maps to `OPEN` (requisition still live) | Phase 2 |
| Re-import + status | **Preserve LuminTrack's status on update** — set on create only. `externalStatusRaw` always refreshes | Phase 3 |
| Re-import + missing rows | Rows absent from the file are NOT touched (no soft-delete on disappear) | Phase 3 |
| Who can import | **Admin only** | Phase 3 |
| Migration method | Standard `prisma migrate dev` — workaround: hand-wrote SQL when sandbox shell tripped on a benign warning prompt | Phase 1 |
| JobPortal future-proofing | Generic model — adding "Dice" / "BountyJobs" is a row insert, not a schema change | Phase 1 |

---

## 4. Decisions — still open (for the phase they belong to)

| Decision | Default if not revisited | Phase to confirm |
|---|---|---|
| Sub-tab UI flavor | Tabs/chips on `/jobs?source=…` (one route, simpler) | 5 |
| Job ID display format | `JOB-00123` (5-digit pad, no year prefix) | 7 |
| Padding width for `CAND-` / `SUB-` | 3 digits | 7 |

---

## 5. iLabor recon — JSON sample (preserved)

Endpoint: `showrequisitionslist` (DataTables server-side pagination shape).
Confirms the extension can intercept the network response instead of DOM-scraping.

```json
{
  "countReq": 0,
  "iTotalDisplayRecords": 306,
  "iTotalRecords": 306,
  "requisitionViewList": [
    {
      "accountManager": "",
      "alternateEmail": "",
      "assignedTo": "Susanna Damera",
      "c2crate": 69.0,
      "clientName": "RANDSTAD",
      "createDate": "2026-05-22T16:25:14",
      "createdBy": "",
      "customerName": "Ameren Ue US - Local",
      "customerRefNo": "133934",
      "department": "Default",
      "favorite": 0,
      "itemCount": 306,
      "jobTitle": "Java/Spring Boot Dev",
      "location": "St. Louis, MO ",
      "noOfActiveSubmissions": 8,
      "noOfPositions": 1,
      "noOfSubmissions": 8,
      "positionType": "Contract position",
      "projectDuration": "12 months",
      "projectedEndDate": "2027-06-22T00:00:00",
      "projectedStartDate": "2026-06-22T00:00:00",
      "questionStatus": 0,
      "releaseDate": "2026-05-22T16:40:31",
      "requisitionId": 159263,
      "requisitionStatus": "Open",
      "rowNumber": 1,
      "submitLimit": 30,
      "submitStatus": 1
    }
  ]
}
```

### Field mapping (iLabor → LuminTrack)

| iLabor field | LuminTrack column | Notes |
|---|---|---|
| `requisitionId` | `Job.portalRefId` | string-ified (e.g. `"159263"`) |
| `customerRefNo` | `Job.atsId` | end-employer's own ID |
| `jobTitle` | `Job.title` | |
| `customerName` | `Client.name` (FK) | per-row find-or-create |
| `clientName` | `Vendor.name` (FK) | always `"RANDSTAD"` today |
| `location` | `Job.location` | |
| `c2crate` | `Job.vendorRate` | iLabor sends number; strings tolerated |
| `noOfPositions` | `Job.positions` | |
| `noOfSubmissions` | `Job.externalSubsCount` | iLabor counts (informational) |
| `noOfActiveSubmissions` | `Job.externalActiveCount` | |
| `projectDuration` | `Job.durationLabel` | free text like `"12 months"` |
| `projectedStartDate` | `Job.startDate` | ISO string |
| `projectedEndDate` | `Job.endDate` | |
| `releaseDate` | `Job.releasedDate` | |
| `createDate` | `Job.externalCreatedDate` | |
| `requisitionStatus` | `Job.externalStatusRaw` + mapped to `Job.status` | mapping in `ilaborStatusToJobStatus()` |
| `assignedTo` | `Job.assignedToName` | free text — iLabor user not modelled |
| `accountManager` | `Job.ownerName` | |
| `alternateEmail` | `Job.ownerAltEmail` | |
| `positionType` | `Job.reqType` | e.g. `"Contract position"` |
| `department` | `Job.department` | |
| `favorite`, `questionStatus`, `submitLimit`, `submitStatus`, `rowNumber`, `itemCount`, `createdBy` | — | operational fields; ignored (passed through by Zod `.passthrough()`) |

### Envelope shape the extension must produce

```ts
{
  source: "lumintrack-ilabor-extension",   // literal string sentinel
  version: 1,                               // pinned; bump on breaking changes
  capturedAt: "2026-05-24T14:30:00.000Z",
  totalRecords: 306,                        // optional, for cross-check
  rows: [ /* iLabor requisitionViewList[] items */ ]
}
```

---

## 6. Phase 4 — what's next, in detail

**Goal:** `/jobs/import` wizard so an admin can upload the JSON file and import.

**Two files to create:**

1. `src/app/(dashboard)/jobs/import/page.tsx` — Server Component shell.
   - `requireUser()` + `if (user.role !== "ADMIN") notFound()` guard.
   - Renders the client wizard component below.

2. `src/components/jobs/import-requisitions.tsx` — Client Component wizard.
   Three states managed with `useState` + `useActionState`:
   - **Step 1 — Upload**: file picker (drag-drop optional). On selection,
     submit to `previewRequisitions` via `useActionState`.
   - **Step 2 — Preview**: four summary cards (new / updated / errored /
     status-warnings), an expandable table of error rows with row index + reason
     + hint (req id + title), "Confirm import" + "Start over" buttons.
   - **Step 3 — Result**: success message ("Created X · Updated Y · Skipped Z"),
     CTA back to `/jobs`.

   The same `File` object is submitted twice — once to preview, once to import.
   No server-side state, no upload tokens.

**One nav entry to add:** "Import from iLabor" button on the Jobs page header,
visible to admins only. Lives in whatever component renders that header (likely
`src/app/(dashboard)/jobs/page.tsx` or a `jobs-toolbar.tsx`).

**Verification:** hand-craft `sample-ilabor.json` (~6 rows: one "Not Filled",
one duplicate Req ID, one missing `customerName`, one matching an existing
seeded job). Wizard should:
- Show `5 new · 1 errored` on preview
- Successfully import on confirm
- Re-running same file shows `0 new · 5 updated · 1 errored`
- Activity timeline shows one `REQUISITIONS_IMPORTED` entry

**Estimated work:** ~30 lines (page) + 250–350 lines (wizard) + ~10 lines
(toolbar button). One round of `tsc --noEmit` + `npm run dev` smoke test.

---

## 7. New-PC setup (after the zip lands)

```bash
# 1. Unzip into a working location.
cd path/to/Lumin_recruiter_dashboard

# 2. Install deps (gitignored, regenerated).
npm install

# 3. Regenerate Prisma client (gitignored, regenerated).
npx prisma generate

# 4. .env must exist — copy from old machine OR re-create from .env.example.
#    Keys needed: DATABASE_URL, DIRECT_URL, AUTH_SECRET, SEED_ADMIN_*.
#    The Neon DB is shared, so the same DATABASE_URL works on both PCs.

# 5. Verify the DB is in sync (no-op if it is).
npx prisma migrate status

# 6. Start the dev server.
npm run dev
# → http://localhost:3000 — log in with the admin from .env.
```

### What to include in the zip (and what NOT to)

| Include | Skip (regenerable) |
|---|---|
| Everything except the items in the right column | `node_modules/` (huge; `npm install` rebuilds) |
| `.git/` (keeps commit history) | `.next/` (build cache) |
| `.env` (gitignored; carry separately if security-sensitive) | `src/generated/prisma/` (`prisma generate` rebuilds) |
| `prisma/migrations/` (this is the source of truth for the schema) | |

---

## 8. First prompt for the new Claude account

Paste this verbatim after the new Claude reads `CLAUDE.md`:

> I'm continuing the LuminTrack iLabor import build. Phases 0–3 are complete
> and verified — see `ILABOR_IMPORT_HANDOFF.md` at the repo root for the live
> snapshot, file map, resolved decisions, and Phase 4 plan. Please read that
> file first, then ask me anything unclear before starting Phase 4 (the
> `/jobs/import` wizard). I want phase-by-phase confirmation as we go, and
> teaching-style narration of each meaningful code change.

The handoff doc has everything the new Claude needs. It should not need to
re-read the full plan unless asked.

---

## 9. Pre-zip checklist

Before zipping the folder:

- [ ] **Commit Phases 1–3 work to git** (currently uncommitted):
  ```bash
  git add prisma/schema.prisma prisma/seed.ts \
          prisma/migrations/20260524142554_jobportal_and_requisition_fields/ \
          src/lib/import/ src/lib/validation/ilabor-import.ts \
          src/server/actions/ilabor-import.ts \
          docs/PLAN_iLabor_import.md ILABOR_IMPORT_HANDOFF.md CLAUDE.md
  git commit -m "iLabor import: phases 1-3 (schema, validation, import action) + handoff docs"
  git push    # if you have a remote
  ```
  This way the new PC can `git pull` instead of relying solely on the zip, and
  the handoff is captured in the project history.
- [ ] Confirm `.env` is in the zip (or carried separately) — it's gitignored.
- [ ] Confirm the zip excludes `node_modules/`, `.next/`, `src/generated/`.
- [ ] On the new PC, run the 6-step setup in §7 before talking to the new Claude.
