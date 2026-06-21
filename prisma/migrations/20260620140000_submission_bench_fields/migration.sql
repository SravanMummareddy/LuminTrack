-- Bench-Sales · P2 — bench fields on Submission (the "Bench Submissions" sheet).
-- Additive: new enum type + three nullable columns. Regular submissions ignore
-- them; Company Name resolves via job.client.

-- CreateEnum
CREATE TYPE "BenchEngagement" AS ENUM ('C2C', 'W2');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "engagement" "BenchEngagement",
ADD COLUMN     "jobDuties" TEXT,
ADD COLUMN     "vendorRecruiterName" TEXT;
