-- D3/V-5: received date on the job — when the requirement actually arrived, so
-- time-to-first-submission is measured from there, not the logged date.
-- Add with a default, backfill existing rows to their createdAt (best proxy),
-- then the default carries new rows.
ALTER TABLE "Job" ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Job" SET "receivedAt" = "createdAt";
