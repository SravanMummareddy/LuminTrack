-- "Résumé not required" waiver on a submission — set when a submission is
-- intentionally made without a résumé. While set, it drops off the missing-
-- résumé worklist. FK SetNull so the waiver survives a waiver's user removal.
ALTER TABLE "Submission" ADD COLUMN "resumeWaivedAt" TIMESTAMP(3);
ALTER TABLE "Submission" ADD COLUMN "resumeWaivedById" TEXT;

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_resumeWaivedById_fkey"
  FOREIGN KEY ("resumeWaivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Submission_resumeWaivedById_idx" ON "Submission"("resumeWaivedById");
