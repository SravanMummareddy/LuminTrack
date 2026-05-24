-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'REQUISITIONS_IMPORTED';

-- CreateTable
CREATE TABLE "JobPortal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPortal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPortal_name_key" ON "JobPortal"("name");

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "portalId" TEXT,
ADD COLUMN     "portalRefId" TEXT,
ADD COLUMN     "atsId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "durationLabel" TEXT,
ADD COLUMN     "positions" INTEGER,
ADD COLUMN     "externalSubsCount" INTEGER,
ADD COLUMN     "externalActiveCount" INTEGER,
ADD COLUMN     "releasedDate" TIMESTAMP(3),
ADD COLUMN     "assignedToName" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "ownerAltEmail" TEXT,
ADD COLUMN     "reqType" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "externalStatusRaw" TEXT,
ADD COLUMN     "externalCreatedDate" TIMESTAMP(3),
ADD COLUMN     "lastImportedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Job_portalId_portalRefId_key" ON "Job"("portalId", "portalRefId");

-- CreateIndex
CREATE INDEX "Job_portalId_idx" ON "Job"("portalId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "JobPortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
