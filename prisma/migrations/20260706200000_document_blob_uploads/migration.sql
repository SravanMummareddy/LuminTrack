-- Candidate documents move from Google Drive links to private Vercel Blob
-- uploads (PDF/DOCX), mirroring résumés. Drop driveLink, add the blob columns.

ALTER TABLE "CandidateDocument" ADD COLUMN "blobPathname" TEXT;
ALTER TABLE "CandidateDocument" ADD COLUMN "blobUrl" TEXT;
ALTER TABLE "CandidateDocument" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "CandidateDocument" ADD COLUMN "contentType" TEXT;
ALTER TABLE "CandidateDocument" DROP COLUMN "driveLink";
