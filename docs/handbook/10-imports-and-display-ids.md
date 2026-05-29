# 10 — Display IDs and the iLabor import

> **In plain English.** Two things glued together in this doc:
> (1) the human-friendly IDs we show in the UI (`JOB-00123`,
> `CAND-001`, `SUB-001`, `REQ-159263`), and (2) how the iLabor
> bulk-importer turns a JSON file from Randstad's portal into Jobs
> in our database.

## Part 1 — Display IDs

### Why we have two IDs per record

- `id` (cuid, opaque) — what the database uses for foreign keys, what
  URLs use (`/jobs/clx7…`). Stable forever.
- `seq Int @unique @default(autoincrement())` — a monotonic counter
  the database hands out at insert time. What humans see.

Both Job, Candidate, and Submission carry `seq`. Migration that
added it: `prisma/migrations/20260524160000_display_sequences/`.

### Formatting

All display-ID code lives in `src/lib/format.ts`:

```ts
formatJobDisplayId(job)         // → "JOB-00123" or "REQ-159263"
formatCandidateDisplayId(c)     // → "CAND-001"
formatSubmissionDisplayId(s)    // → "SUB-001"
```

Rules:
- **Job.** If `portalRefId` is set, render `REQ-<portalRefId>` (use
  iLabor's own ID — no padding). Otherwise `JOB-<seq>` padded to 5
  digits.
- **Candidate.** `CAND-<seq>` padded to 3 digits.
- **Submission.** `SUB-<seq>` padded to 3 digits.

### Where they show up

- The "ID" column on the Jobs / Candidates / Submissions lists.
- Page titles on detail pages.
- The Audit page's entity-reference text.
- The /jobs/imports history rows.

### Why this is worth its own column

- Easier to reference verbally: "look at REQ-159263" vs reading out a
  CUID.
- Stable across re-imports (the same iLabor req keeps its REQ id).
- Padding makes IDs sort nicely as strings.

## Part 2 — The iLabor import

iLabor is Randstad's vendor management system. Recruiters log in
there and see requisitions. We *don't* want to manually copy each
into LuminTrack, so we built a pipeline.

### Today's pipeline

```
[iLabor portal in browser]
   │  (admin pastes a JSON capture, OR a future browser
   │   extension scrapes + downloads it)
   ▼
admin uploads JSON file at /jobs/import
   │
   ▼
previewRequisitions(formData)    ← read-only validation
   │  shows: N new, N updated, N errored, status warnings
   ▼
admin clicks "Confirm import"
   │
   ▼
importRequisitions(formData)     ← writes inside one $transaction
   │  - acquires pg advisory lock (concurrent-import guard)
   │  - find-or-creates JobPortal, Vendor, Client
   │  - upserts Job on (portalId, portalRefId)
   │  - writes REQUISITIONS_IMPORTED audit entry
   │  - writes per-job JOB_IMPORTED audit entries
   ▼
redirect to /jobs/imports (history page)
```

### Files involved

| File                                            | Role                                              |
|-------------------------------------------------|---------------------------------------------------|
| `src/server/actions/ilabor-import.ts`           | The two actions: `previewRequisitions`, `importRequisitions`. |
| `src/lib/validation/ilabor-import.ts`           | Zod schemas for the envelope + each row. Maps iLabor status → our JobStatus. |
| `src/lib/import/ilabor-format.ts`               | Tolerant envelope adapter (accepts raw network captures). |
| `src/app/(dashboard)/jobs/import/page.tsx`      | Admin wizard UI: upload → preview → confirm.      |
| `src/app/(dashboard)/jobs/imports/page.tsx`     | Import history list (one row per import event).   |
| `prisma/backfill-job-imported.ts`               | One-off script: backfills JOB_IMPORTED audit rows for jobs imported before that audit existed. |

### The tolerant envelope adapter

iLabor's JSON has wandered between formats over time. Rather than
require the admin to massage the file, `src/lib/import/ilabor-format.ts`
sniffs the shape and normalises it before validation runs. This is
why admins today can paste a raw network capture directly — the
adapter handles both the captured shape and the cleaner extension
shape.

### The advisory lock

```sql
SELECT pg_try_advisory_xact_lock(817293744) AS ok
```

The `import` action wraps its writes in `$transaction` and the very
first statement is the advisory lock. If another import is already
running, `pg_try_advisory_xact_lock` returns `false`, we bail with
an error, and the second admin sees "Another import is in progress."
The lock auto-releases when the transaction ends — no manual cleanup.

Why not a row-level lock? Because two concurrent imports could be
working on disjoint sets of Jobs and Postgres wouldn't block them.
The advisory lock is process-coordination semantics, not data
semantics.

### The upsert key

Jobs imported from a portal are unique on `(portalId, portalRefId)`.
See the schema:

```prisma
@@unique([portalId, portalRefId])
```

This means re-running the importer:
- Creates *new* Jobs for unseen `portalRefId`s.
- Updates the existing Job for known `portalRefId`s.

What gets updated and what doesn't:
- **Updated on re-import:** every iLabor data column
  (`atsId`, `startDate`, `endDate`, `durationLabel`, `positions`,
  `externalSubsCount`, `externalActiveCount`, `releasedDate`,
  `assignedToName`, `ownerName`, `ownerAltEmail`, `reqType`,
  `department`, `externalStatusRaw`, `externalCreatedDate`,
  `submitLimit`, `ilaborSubmitOpen`, `ilaborScreenerCode`,
  `vendorRate`), `lastImportedAt`.
- **NOT updated on re-import:** `status` (LuminTrack's value, possibly
  hand-edited, is left alone). The preview surfaces a "status
  diverged" warning so the operator can decide.
- **NOT touched ever:** Submissions, InterviewRounds, Notes,
  Placements, Activity rows. They link to the Job by `jobId` and
  the importer never selects them. Your recruiter work survives.

### Diff-based re-import (2026-05-28)

The importer no longer overwrites unchanged columns. Per row it
runs `diffJobFields(prior, next)` (date-safe via `getTime()`,
decimal-safe via `Number(x.toString()).toFixed(2)`) and branches:

| Diff result | Write | Audit |
|---|---|---|
| No fields changed | `UPDATE jobs SET lastImportedAt = now()` only | none |
| ≥1 field changed | `UPDATE` with **only** changed columns | one `JOB_UPDATED` row whose `description` is `field old → new; field old → new` |

`unchangedCount` is returned in the result + preview summary so
the operator sees "4 new · 12 changed · 290 unchanged" before and
after confirm.

### Change log — three surfaces, zero new tables

Per-row audits are linked to their parent import run via
`Activity.note = "importRunId:<id>"` (no schema change — `note`
was already nullable text). To keep that correlation possible,
the summary `REQUISITIONS_IMPORTED` row is **pre-created** before
the per-row loop so its id is known when stamping per-row notes;
the summary row's `description` and `newValue` are filled in
after the loop via `prisma.activity.update`.

Three places to read the log:

1. **Job timeline** — the per-job page already streams its
   Activity rows; `JOB_UPDATED` shows up with the diff string.
2. **`/jobs/imports/[activityId]`** — admin-only drill-down.
   Summary card + table of every changed job with its diff
   bullets + list of new jobs. "Download .txt" and "Download
   .csv" buttons in the header.
3. **`/audit`** — filter by `JOB_UPDATED`; rows whose `note`
   starts with `importRunId:` get a `(open import run)` link.

### Downloadable change log

`src/app/api/jobs/imports/[id]/changelog/route.ts` — admin-only
Route Handler. `?format=txt` (human-readable) or `?format=csv`
(one row per **field change**, columns
`displayId,title,client,changeType,field,old,new`). Logs a
`DATA_EXPORTED` audit row with
`note = "kind=ilabor-changelog;runId=<id>;format=<…>;bytes=<…>"`.
Cache-Control: no-store. No on-disk file; generated on demand
from existing Activity rows.

### Source-mirror for portals (2026-05-28)

Every `JobPortal` has a same-named `SisterCompanySource` so jobs
imported from a portal also attribute to a Source for `/reports`
breakdowns. The convention is enforced by
`src/server/portals.ts`:

```ts
ensureSourceForPortal(db, portalName) // upsert SisterCompanySource by name
```

Called next to every JobPortal upsert (`seed.ts`,
`importRequisitions` Phase B.1). The importer sets
`sisterCompanySourceId` on the **create** path of the job upsert
only — admin re-tags on existing jobs survive re-imports. One-off
`prisma/backfill-portal-sources.ts` mirrors every existing portal
and back-fills dangling jobs. Preview UI shows a Source banner
("existing" slate vs "will be created" amber) before confirm.

### Status mapping

iLabor's statuses don't match ours 1:1. `ilaborStatusToJobStatus` in
`src/lib/validation/ilabor-import.ts` maps the known ones (Open,
Closed, Filled, Cancelled, On Hold). Anything unknown falls through
to `OPEN` and surfaces as a "status warning" in the preview.

### Audit rows

Two audit actions exist for imports:
- `REQUISITIONS_IMPORTED` — one row per import event, attached to no
  particular Job. Carries a description like "Imported 12 new, 5
  updated, 1 errored".
- `JOB_IMPORTED` — one row per Job, attached to that Job. Lets you
  see "this Job was imported on date X" from inside the job's own
  timeline.

`JOB_IMPORTED` was added later (enum migration
`20260524180000_job_imported_action`). The one-off backfill script
`prisma/backfill-job-imported.ts` adds the audit row for every
imported Job that predated the enum value.

### The history page (`/jobs/imports`)

Lists every `REQUISITIONS_IMPORTED` audit row in reverse-chronological
order with: when, who, how many new/updated/errored. Paginated.

### What's still pending

**Phase 8b** — the browser extension (separate repo, Manifest V3)
that automates the "capture JSON from the iLabor portal and download
it" step. Today admins do that by hand. The extension is purely a
UX upgrade; the import pipeline itself works fine without it.

See `ILABOR_IMPORT_HANDOFF.md` at the repo root for the live status.
