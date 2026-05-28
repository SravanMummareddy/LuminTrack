-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('ACTIVE', 'EXTENDED', 'ENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PlacementEndReason" AS ENUM ('COMPLETED', 'TERMINATED_BY_CLIENT', 'RESIGNED', 'PERFORMANCE', 'OTHER');

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "submissionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "billRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PlacementStatus" NOT NULL DEFAULT 'ACTIVE',
    "endReason" "PlacementEndReason",
    "endNote" TEXT,
    "replacementSubmissionId" TEXT,
    "clientPoNumber" TEXT,
    "invoiceRef" TEXT,
    "onsiteManagerName" TEXT,
    "onsiteManagerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacementExtension" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacementExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Placement_seq_key" ON "Placement"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_submissionId_key" ON "Placement"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_replacementSubmissionId_key" ON "Placement"("replacementSubmissionId");

-- CreateIndex
CREATE INDEX "Placement_status_endDate_idx" ON "Placement"("status", "endDate");

-- CreateIndex
CREATE INDEX "Placement_candidateId_idx" ON "Placement"("candidateId");

-- CreateIndex
CREATE INDEX "Placement_jobId_idx" ON "Placement"("jobId");

-- CreateIndex
CREATE INDEX "PlacementExtension_placementId_idx" ON "PlacementExtension"("placementId");

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_replacementSubmissionId_fkey" FOREIGN KEY ("replacementSubmissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementExtension" ADD CONSTRAINT "PlacementExtension_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
