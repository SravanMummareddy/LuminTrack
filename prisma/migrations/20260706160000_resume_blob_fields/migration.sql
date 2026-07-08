-- Résumés move from Google Drive links to private Vercel Blob uploads. New
-- résumés are uploads; the legacy driveLink stays (now nullable) so pre-Blob
-- rows still render.

ALTER TABLE "CandidateResume" ALTER COLUMN "driveLink" DROP NOT NULL;

ALTER TABLE "CandidateResume" ADD COLUMN "blobPathname" TEXT;
ALTER TABLE "CandidateResume" ADD COLUMN "blobUrl" TEXT;
ALTER TABLE "CandidateResume" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "CandidateResume" ADD COLUMN "contentType" TEXT;
