# Workflow 12 — iLabor import (admin)

> **In plain English.** Randstad's iLabor portal has a wall of
> requisitions our team might want to recruit for. Rather than copy
> each one into LuminTrack by hand, an admin uploads a JSON file
> they pulled from iLabor and our importer creates / updates Jobs
> in bulk.

**Who uses it:** admins only.

**Routes:**

- `/jobs/import` — the upload + preview + confirm wizard.
- `/jobs/imports` — history of past imports.
- `/jobs?source=ilabor` — the imported jobs.

For the underlying pipeline (advisory lock, upsert key, status
mapping), see [`../10-imports-and-display-ids.md`](../10-imports-and-display-ids.md).

## The wizard (`/jobs/import`)

### Step 1 — Upload

A file input that accepts `.json`. The page is a single Client
Component (`src/components/jobs/import-requisitions.tsx`) wrapping
the two server actions.

### Step 2 — Preview

After upload, the page calls `previewRequisitions(formData)`. The
action validates the envelope and each row (no DB writes).

You see:

- A summary card: total rows · new · updated · errored · status
  warnings · capture timestamp.
- A "New jobs" table.
- An "Updated jobs" table with a **Status diverged** column flagging
  rows whose LuminTrack status differs from the iLabor one.
- An "Errored rows" table with the reason + a hint (req id + title)
  so the admin can find the row in iLabor.

### Step 3 — Confirm

Clicking "Confirm import" calls `importRequisitions(formData)`:

- Acquires `pg_try_advisory_xact_lock(817293744)` — concurrent
  imports bail with an error.
- Find-or-creates the `JobPortal` ("Randstad iLabor"), Vendor, Client.
- Upserts each Job on `(portalId, portalRefId)`.
- Writes a single `REQUISITIONS_IMPORTED` audit row (with
  description "Imported N new, N updated, N errored") and one
  `JOB_IMPORTED` per Job.

Redirects to `/jobs/imports` on success.

## The history page (`/jobs/imports`)

One row per import event. Columns: when · who · new · updated ·
errored · status warnings. Paginated.

## The source tab on `/jobs`

`/jobs?source=ilabor` filters the main list to imported jobs only.
`/jobs?source=manual` shows manual-only.

## What admins do day-to-day

1. Open iLabor in a separate tab.
2. (Today) Run a small browser action that captures the requisitions
   JSON. (Phase 8b will automate this via a Manifest V3 extension in a
   separate repo.)
3. Save the JSON locally.
4. Go to `/jobs/import` in LuminTrack, upload, review the preview,
   click Confirm.
5. Optionally visit `/jobs?source=ilabor` to verify the new rows.

## Code map

- Page: `src/app/(dashboard)/jobs/import/page.tsx`.
- History: `src/app/(dashboard)/jobs/imports/page.tsx`.
- Wizard UI: `src/components/jobs/import-requisitions.tsx`.
- Source tabs: `src/components/jobs/job-source-tabs.tsx`.
- Actions: `src/server/actions/ilabor-import.ts`.
- Validation: `src/lib/validation/ilabor-import.ts`.
- Tolerant envelope adapter: `src/lib/import/ilabor-format.ts`.

## Why we built it this way

- **Wizard with explicit preview.** The first version imported
  immediately; the admin had no idea what would happen. A read-only
  preview step costs little and prevents nasty surprises (status
  divergence, badly parsed rows).
- **Advisory lock, not row lock.** Concurrent imports could be
  acting on disjoint Jobs; Postgres won't block them. The advisory
  lock provides process-coordination semantics.
- **Status preserved on re-import.** Hand-edited statuses
  (`FILLED`, `CANCELLED`) should not be clobbered by stale iLabor
  data. The diverged column makes the trade-off visible.
- **`JOB_IMPORTED` audit added later + backfill.** Originally we
  only had `REQUISITIONS_IMPORTED` (the event). Per-job audit makes
  the job's own timeline self-explanatory. Backfill script ensures
  pre-existing imported jobs still get the audit row.
- **Tolerant envelope adapter.** Field shapes wandered. We didn't
  want admins doing JSON surgery in a text editor.
