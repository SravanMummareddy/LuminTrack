-- Restore array defaults on `Candidate.tags` and `Candidate.featuredSkills`.
-- A prior auto-generated migration removed these; they now live in the
-- schema as `@default([])` and need to be re-applied to the DB.
ALTER TABLE "Candidate"
  ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "featuredSkills" SET DEFAULT ARRAY[]::TEXT[];
