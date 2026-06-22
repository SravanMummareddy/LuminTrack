-- Bench-Sales module · Phase 0
-- Additive enum values + User scorecard fields. No statement *uses* the new
-- enum values here, so adding them alongside the column changes is safe.

-- AlterEnum (ActivityAction) — bench audit actions, logged against the consultant
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_CONSULTANT_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_CONSULTANT_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_SUBMISSION_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_SUBMISSION_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_SUBMISSION_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_INTERVIEW_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_INTERVIEW_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_PLACEMENT_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BENCH_PLACEMENT_UPDATED';

-- AlterEnum (EntityType) — polymorphic discriminator for bench-consultant audit rows
ALTER TYPE "EntityType" ADD VALUE 'CONSULTANT';

-- AlterTable — Monthly Performance scorecard fields
ALTER TABLE "User" ADD COLUMN     "empId" TEXT,
ADD COLUMN     "teamLabel" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_empId_key" ON "User"("empId");
