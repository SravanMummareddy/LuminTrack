-- Backfill NULL array values on Candidate text[] columns and lock them down.
--
-- Background: despite the schema declaring these columns String[] @default([]),
-- some rows in the live DB ended up with NULL because the columns landed
-- nullable on the table (the original migrations had inconsistent NOT NULL
-- coverage). When the candidate detail page rendered such a row, calling
-- `.length` on the value crashed at runtime ("Cannot read properties of
-- undefined (reading 'length')").
--
-- Fix: backfill NULLs to '{}', set defaults, and enforce NOT NULL so this
-- can't recur.

UPDATE "Candidate" SET "skills"         = '{}' WHERE "skills"         IS NULL;
UPDATE "Candidate" SET "featuredSkills" = '{}' WHERE "featuredSkills" IS NULL;
UPDATE "Candidate" SET "tags"           = '{}' WHERE "tags"           IS NULL;

ALTER TABLE "Candidate"
  ALTER COLUMN "skills"         SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "skills"         SET NOT NULL,
  ALTER COLUMN "featuredSkills" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "featuredSkills" SET NOT NULL,
  ALTER COLUMN "tags"           SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "tags"           SET NOT NULL;
