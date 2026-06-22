-- Bench/Vendor-Portal rate pair + team lead on submissions, and Support (Y/N)
-- on interview rounds. All additive; nullable (or defaulted) so existing rows
-- and non-bench flows are unaffected.
ALTER TABLE "Submission" ADD COLUMN "payRate" DECIMAL(12,2);
ALTER TABLE "Submission" ADD COLUMN "billRate" DECIMAL(12,2);
ALTER TABLE "Submission" ADD COLUMN "teamLead" TEXT;

ALTER TABLE "InterviewRound" ADD COLUMN "supportNeeded" BOOLEAN NOT NULL DEFAULT false;
