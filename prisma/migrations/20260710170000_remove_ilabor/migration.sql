-- Remove the iLabor / Randstad requisition-import feature. Jobs are now added
-- manually only. This drops the JobPortal table, the Job → portal linkage, and
-- all iLabor-only signal/metadata columns. The 7 generic job-detail columns
-- (atsId, startDate, endDate, durationLabel, positions, reqType, department) are
-- KEPT — they're now plain manual-job fields.
--
-- The ActivityAction enum values REQUISITIONS_IMPORTED / JOB_IMPORTED are left
-- in place: dropping a Postgres enum value requires recreating the type, and
-- historical Activity rows may still reference them.

-- Drop the portal linkage first (FK, upsert-key unique, and its index).
ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "Job_portalId_fkey";
DROP INDEX IF EXISTS "Job_portalId_portalRefId_key";
DROP INDEX IF EXISTS "Job_portalId_idx";

-- Drop the iLabor-only columns on Job.
ALTER TABLE "Job"
  DROP COLUMN IF EXISTS "portalId",
  DROP COLUMN IF EXISTS "portalRefId",
  DROP COLUMN IF EXISTS "externalSubsCount",
  DROP COLUMN IF EXISTS "externalActiveCount",
  DROP COLUMN IF EXISTS "releasedDate",
  DROP COLUMN IF EXISTS "assignedToName",
  DROP COLUMN IF EXISTS "ownerName",
  DROP COLUMN IF EXISTS "ownerAltEmail",
  DROP COLUMN IF EXISTS "externalStatusRaw",
  DROP COLUMN IF EXISTS "externalCreatedDate",
  DROP COLUMN IF EXISTS "lastImportedAt",
  DROP COLUMN IF EXISTS "submitLimit",
  DROP COLUMN IF EXISTS "ilaborSubmitOpen",
  DROP COLUMN IF EXISTS "ilaborScreenerCode";

-- Finally drop the now-unreferenced portal table.
DROP TABLE IF EXISTS "JobPortal";
