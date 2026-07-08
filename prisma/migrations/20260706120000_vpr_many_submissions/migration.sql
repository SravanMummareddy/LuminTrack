-- VPR → many submissions: replace the old 1:1 convert link with a plain
-- many→one FK on Submission so a single VendorRequirement can accumulate
-- multiple candidate submissions while it stays OPEN.

-- 1) Drop the old 1:1 link (unique FK from VendorRequirement → Submission).
ALTER TABLE "VendorRequirement" DROP CONSTRAINT IF EXISTS "VendorRequirement_convertedSubmissionId_fkey";
DROP INDEX IF EXISTS "VendorRequirement_convertedSubmissionId_key";
ALTER TABLE "VendorRequirement" DROP COLUMN IF EXISTS "convertedSubmissionId";

-- 2) Add the many→one link on Submission (submission → the VPR it was made for).
ALTER TABLE "Submission" ADD COLUMN "vendorRequirementId" TEXT;

CREATE INDEX "Submission_vendorRequirementId_idx" ON "Submission"("vendorRequirementId");

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_vendorRequirementId_fkey"
  FOREIGN KEY ("vendorRequirementId") REFERENCES "VendorRequirement"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
