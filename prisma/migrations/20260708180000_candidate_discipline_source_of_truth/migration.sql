-- Discipline (IT/Non-IT) is a property of the person → move it onto the Candidate
-- (the source of truth). Copy any value already set on a linked bench row first,
-- then drop the bench column (the bench now reads its candidate's discipline).
ALTER TABLE "Candidate" ADD COLUMN "discipline" "Discipline";

UPDATE "Candidate" c
SET "discipline" = b."discipline"
FROM "BenchConsultant" b
WHERE b."candidateId" = c."id" AND b."discipline" IS NOT NULL;

ALTER TABLE "BenchConsultant" DROP COLUMN "discipline";
