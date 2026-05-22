-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_sisterCompanySourceId_fkey";

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "InterviewRound" ADD COLUMN     "interviewMode" TEXT,
ADD COLUMN     "interviewPlatform" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "sourceOther" TEXT,
ALTER COLUMN "sisterCompanySourceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SisterCompanySource" ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "location" TEXT;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sisterCompanySourceId_fkey" FOREIGN KEY ("sisterCompanySourceId") REFERENCES "SisterCompanySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
