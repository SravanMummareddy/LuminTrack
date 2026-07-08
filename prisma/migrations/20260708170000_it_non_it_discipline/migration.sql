-- Broad IT vs Non-IT discipline on requisitions and bench consultants.
-- Creating a brand-new enum type and using it in the same migration is safe
-- (unlike ALTER TYPE ... ADD VALUE, which can't be used in the same tx).
CREATE TYPE "Discipline" AS ENUM ('IT', 'NON_IT');

ALTER TABLE "Job" ADD COLUMN "discipline" "Discipline";
ALTER TABLE "BenchConsultant" ADD COLUMN "discipline" "Discipline";
