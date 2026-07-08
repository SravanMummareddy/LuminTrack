-- Job lifecycle trash + erase, mirroring the candidate ladder.
-- deletedAt = moved to trash (hidden everywhere, restorable; a scheduled job
-- erases rows past the retention window). erasedAt = permanently erased
-- tombstone (row kept + anonymized so submissions/analytics survive; an EMPTY
-- job with no submissions/placements is hard-removed instead). A backup zip is
-- written to Blob before either erase path.
ALTER TABLE "Job" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "erasedAt" TIMESTAMP(3);
CREATE INDEX "Job_deletedAt_idx" ON "Job"("deletedAt");

-- New audit action for a permanent job erase (trash/restore reuse JOB_UPDATED).
ALTER TYPE "ActivityAction" ADD VALUE 'JOB_ERASED';
