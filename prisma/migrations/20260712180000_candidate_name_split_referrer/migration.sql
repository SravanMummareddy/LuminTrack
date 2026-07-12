-- Candidate + Bench name split (fullName kept, now derived) + Candidate.referrerId FK.
-- Additive: all new columns nullable; deterministic backfill from fullName
-- (first token -> firstName, remainder -> lastName). fullName + legacy source
-- are retained. referrerId reuses the Jobs Referrer directory (#86).

-- New columns
ALTER TABLE "Candidate" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "lastName" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "referrerId" TEXT;

ALTER TABLE "BenchConsultant" ADD COLUMN "firstName" TEXT;
ALTER TABLE "BenchConsultant" ADD COLUMN "lastName" TEXT;

-- Backfill: split existing fullName — first whitespace-delimited token becomes
-- firstName, the remainder (incl. any middle names) becomes lastName. A single
-- word yields firstName = the word, lastName = NULL.
UPDATE "Candidate"
SET "firstName" = split_part("fullName", ' ', 1),
    "lastName"  = NULLIF(trim(substr("fullName", length(split_part("fullName", ' ', 1)) + 1)), '');

UPDATE "BenchConsultant"
SET "firstName" = split_part("fullName", ' ', 1),
    "lastName"  = NULLIF(trim(substr("fullName", length(split_part("fullName", ' ', 1)) + 1)), '');

-- FK: Candidate.referrerId -> Referrer(id), null on referrer delete.
ALTER TABLE "Candidate"
  ADD CONSTRAINT "Candidate_referrerId_fkey"
  FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
