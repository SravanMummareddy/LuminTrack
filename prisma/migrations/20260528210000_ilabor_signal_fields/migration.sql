-- Three new nullable iLabor signal columns on Job. See plan
-- expressive-whistling-hedgehog: submitStatus / questionStatus are
-- captured as raw ints; submitLimit travels under iLabor's own name.
ALTER TABLE "Job"
  ADD COLUMN "submitLimit"        INTEGER,
  ADD COLUMN "ilaborSubmitOpen"   INTEGER,
  ADD COLUMN "ilaborScreenerCode" INTEGER;
