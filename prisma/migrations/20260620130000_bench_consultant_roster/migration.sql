-- Bench-Sales · P1 — BenchConsultant roster (marketing hotlist) + audit FK.
-- Fully additive: new enum TYPES, a new table, and two nullable FK columns on
-- the polymorphic Note/Activity tables. No ALTER TYPE ADD VALUE here.

-- CreateEnum
CREATE TYPE "BenchPriority" AS ENUM ('HIGH', 'SECOND');
-- CreateEnum
CREATE TYPE "BenchMarketingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'PLACED', 'INACTIVE');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "benchConsultantId" TEXT;
-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "benchConsultantId" TEXT;

-- CreateTable
CREATE TABLE "BenchConsultant" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "currentLocation" TEXT,
    "workAuthorization" TEXT,
    "mVisa" TEXT,
    "aVisa" TEXT,
    "marketingExpYears" DECIMAL(4,1),
    "realTimeExpYears" DECIMAL(4,1),
    "technology" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reference" TEXT,
    "company" TEXT,
    "projectType" TEXT,
    "leastRateC2C" DECIMAL(12,2),
    "callType" TEXT,
    "payrollType" TEXT,
    "relocation" BOOLEAN NOT NULL DEFAULT false,
    "marketingStartDate" TIMESTAMP(3),
    "marketingEmail" TEXT,
    "marketingPassword" TEXT,
    "marketingNumber" TEXT,
    "personalNumber" TEXT,
    "priority" "BenchPriority" NOT NULL DEFAULT 'SECOND',
    "marketingStatus" "BenchMarketingStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "candidateId" TEXT,
    "recruiterId" TEXT,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "BenchConsultant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BenchConsultant_seq_key" ON "BenchConsultant"("seq");
-- CreateIndex
CREATE UNIQUE INDEX "BenchConsultant_candidateId_key" ON "BenchConsultant"("candidateId");
-- CreateIndex
CREATE INDEX "BenchConsultant_priority_marketingStatus_idx" ON "BenchConsultant"("priority", "marketingStatus");
-- CreateIndex
CREATE INDEX "BenchConsultant_recruiterId_idx" ON "BenchConsultant"("recruiterId");
-- CreateIndex
CREATE INDEX "BenchConsultant_marketingStatus_idx" ON "BenchConsultant"("marketingStatus");
-- CreateIndex
CREATE INDEX "BenchConsultant_fullName_idx" ON "BenchConsultant"("fullName");
-- CreateIndex
CREATE INDEX "BenchConsultant_createdAt_idx" ON "BenchConsultant"("createdAt");
-- CreateIndex
CREATE INDEX "Activity_benchConsultantId_idx" ON "Activity"("benchConsultantId");
-- CreateIndex
CREATE INDEX "Note_benchConsultantId_idx" ON "Note"("benchConsultantId");

-- AddForeignKey
ALTER TABLE "BenchConsultant" ADD CONSTRAINT "BenchConsultant_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BenchConsultant" ADD CONSTRAINT "BenchConsultant_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BenchConsultant" ADD CONSTRAINT "BenchConsultant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_benchConsultantId_fkey" FOREIGN KEY ("benchConsultantId") REFERENCES "BenchConsultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_benchConsultantId_fkey" FOREIGN KEY ("benchConsultantId") REFERENCES "BenchConsultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
