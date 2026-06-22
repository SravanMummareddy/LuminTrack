-- Vendor Portal Requirements — pre-submission planning layer.
-- Additive: a new enum TYPE (RequirementStatus), the VendorRequirement table,
-- and two nullable columns (User.isTeamLead, Activity.requirementId).
-- The existing-enum value adds (EntityType.REQUIREMENT + ActivityAction.*) live
-- in the companion migration 20260621120100, per the enum-add-then-use convention.

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('OPEN', 'CONVERTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "requirementId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isTeamLead" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VendorRequirement" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "status" "RequirementStatus" NOT NULL DEFAULT 'OPEN',
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT,
    "recruiterId" TEXT,
    "location" TEXT,
    "payRate" DECIMAL(12,2),
    "billRate" DECIMAL(12,2),
    "candidateRate" DECIMAL(12,2),
    "engagement" "BenchEngagement",
    "vendorRecruiterName" TEXT,
    "jobDuties" TEXT,
    "teamLead" TEXT,
    "submissionNotes" TEXT,
    "candidateResumeId" TEXT,
    "resumeDriveLink" TEXT,
    "convertedSubmissionId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorRequirement_seq_key" ON "VendorRequirement"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRequirement_convertedSubmissionId_key" ON "VendorRequirement"("convertedSubmissionId");

-- CreateIndex
CREATE INDEX "VendorRequirement_status_idx" ON "VendorRequirement"("status");

-- CreateIndex
CREATE INDEX "VendorRequirement_jobId_idx" ON "VendorRequirement"("jobId");

-- CreateIndex
CREATE INDEX "VendorRequirement_candidateId_idx" ON "VendorRequirement"("candidateId");

-- CreateIndex
CREATE INDEX "VendorRequirement_recruiterId_idx" ON "VendorRequirement"("recruiterId");

-- CreateIndex
CREATE INDEX "Activity_requirementId_idx" ON "Activity"("requirementId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "VendorRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequirement" ADD CONSTRAINT "VendorRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequirement" ADD CONSTRAINT "VendorRequirement_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequirement" ADD CONSTRAINT "VendorRequirement_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequirement" ADD CONSTRAINT "VendorRequirement_convertedSubmissionId_fkey" FOREIGN KEY ("convertedSubmissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequirement" ADD CONSTRAINT "VendorRequirement_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequirement" ADD CONSTRAINT "VendorRequirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
