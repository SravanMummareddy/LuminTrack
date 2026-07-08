-- Soft-delete "trash" state with a grace period. deletedAt = moved to trash
-- (hidden everywhere, restorable); a scheduled job hard-erases rows whose
-- deletedAt is older than the retention window, which sets erasedAt.
ALTER TABLE "Candidate" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Candidate_deletedAt_idx" ON "Candidate"("deletedAt");
