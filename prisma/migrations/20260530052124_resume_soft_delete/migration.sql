-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'RESUME_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'RESUME_RESTORED';

-- DropIndex
DROP INDEX "CandidateResume_candidateId_idx";

-- AlterTable
ALTER TABLE "CandidateResume" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "CandidateResume_candidateId_isActive_idx" ON "CandidateResume"("candidateId", "isActive");
