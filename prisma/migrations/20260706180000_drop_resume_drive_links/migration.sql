-- Résumés are upload-only now (private Vercel Blob). Drop the legacy Google
-- Drive columns for résumés. (Candidate *documents* keep their driveLink — no
-- Blob upload was built for those.)

ALTER TABLE "CandidateResume" DROP COLUMN "driveLink";
ALTER TABLE "Submission" DROP COLUMN "resumeDriveLink";
ALTER TABLE "VendorRequirement" DROP COLUMN "resumeDriveLink";
