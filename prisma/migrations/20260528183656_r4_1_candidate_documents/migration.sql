-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY', 'WORK_AUTH', 'EDUCATION', 'EMPLOYMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'CANDIDATE_DOCUMENT_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE 'CANDIDATE_DOCUMENT_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CANDIDATE_DOCUMENT_REMOVED';

-- CreateTable
CREATE TABLE "CandidateDocument" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "candidateId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "driveLink" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateDocument_seq_key" ON "CandidateDocument"("seq");

-- CreateIndex
CREATE INDEX "CandidateDocument_candidateId_category_idx" ON "CandidateDocument"("candidateId", "category");

-- CreateIndex
CREATE INDEX "CandidateDocument_expiresAt_idx" ON "CandidateDocument"("expiresAt");

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
