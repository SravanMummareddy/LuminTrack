-- Résumé library: a candidate keeps many labelled résumés; a submission
-- references the one used. Hand-ordered so the candidate résumé links are
-- backfilled into the new table BEFORE Candidate.resumeDriveLink is dropped.

-- CreateTable
CREATE TABLE "CandidateResume" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "driveLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateResume_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "candidateResumeId" TEXT;

-- Backfill: each candidate with a résumé link gets one "General" library entry.
INSERT INTO "CandidateResume" ("id", "candidateId", "label", "driveLink", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'General', c."resumeDriveLink", c."createdAt", c."updatedAt"
FROM "Candidate" c
WHERE c."resumeDriveLink" IS NOT NULL AND btrim(c."resumeDriveLink") <> '';

-- Backfill: point existing submissions at the matching backfilled résumé.
UPDATE "Submission" s
SET "candidateResumeId" = cr."id"
FROM "CandidateResume" cr
WHERE cr."candidateId" = s."candidateId"
  AND cr."driveLink" = s."resumeDriveLink"
  AND s."resumeDriveLink" IS NOT NULL;

-- DropColumn (after backfill)
ALTER TABLE "Candidate" DROP COLUMN "resumeDriveLink";

-- CreateIndex
CREATE INDEX "CandidateResume_candidateId_idx" ON "CandidateResume"("candidateId");

-- CreateIndex
CREATE INDEX "Submission_candidateResumeId_idx" ON "Submission"("candidateResumeId");

-- AddForeignKey
ALTER TABLE "CandidateResume" ADD CONSTRAINT "CandidateResume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_candidateResumeId_fkey" FOREIGN KEY ("candidateResumeId") REFERENCES "CandidateResume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
