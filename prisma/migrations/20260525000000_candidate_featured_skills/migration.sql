-- Top-3 "featured" skills per candidate. Subset of `skills`. Drives the
-- truncated badge list on /candidates so the visible chips are the *important*
-- ones rather than arbitrary first-three from the free-form skills array.
ALTER TABLE "Candidate" ADD COLUMN "featuredSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
