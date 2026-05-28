-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'CANDIDATE_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'PLACEMENT_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'PLACEMENT_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'PLACEMENT_EXTENDED';
ALTER TYPE "ActivityAction" ADD VALUE 'PLACEMENT_ENDED';
