-- §D5 — capture interview timezone alongside the UTC scheduledAt.
ALTER TABLE "InterviewRound" ADD COLUMN "scheduledTimezone" TEXT;

-- §C4 — drop the DB-level duplicate-submission block so the action layer can
-- offer an "override with reason" path. The check still happens in code; only
-- the hard DB constraint goes away. An ordinary index keeps the per-candidate
-- and per-job lookups fast.
DROP INDEX IF EXISTS "Submission_candidateId_jobId_key";
CREATE INDEX "Submission_candidateId_jobId_idx" ON "Submission"("candidateId", "jobId");

ALTER TABLE "Submission" ADD COLUMN "duplicateReason" TEXT;
