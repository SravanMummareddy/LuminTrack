-- Technology (single major focus tech) and real-time experience are properties
-- of the person → live on the Candidate (source of truth). Technology moves off
-- the bench overlay: copy any value already set on a linked bench row first,
-- then drop the bench column (the bench now reads/writes its candidate's
-- technology, mirroring how `discipline` was moved candidate-first).
ALTER TABLE "Candidate" ADD COLUMN "technology" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "realTimeExperienceYears" DECIMAL(4, 1);

UPDATE "Candidate" c
SET "technology" = b."technology"
FROM "BenchConsultant" b
WHERE b."candidateId" = c."id" AND b."technology" IS NOT NULL;

ALTER TABLE "BenchConsultant" DROP COLUMN "technology";
