-- Optional context on an Activity row, captured mainly on submission status
-- changes: the real-world event date/time, a free-text note, and a preset
-- reason category. All nullable — historical rows stay null.

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "eventAt" TIMESTAMP(3);
ALTER TABLE "Activity" ADD COLUMN "note" TEXT;
ALTER TABLE "Activity" ADD COLUMN "reason" TEXT;
