-- C-1: résumé type (Original vs Marketing).
-- Additive + backward-compatible: the DEFAULT backfills every existing row to
-- ORIGINAL, so no candidate is flagged as missing an original by this change.

CREATE TYPE "ResumeKind" AS ENUM ('ORIGINAL', 'MARKETING');

ALTER TABLE "CandidateResume"
  ADD COLUMN "kind" "ResumeKind" NOT NULL DEFAULT 'ORIGINAL';
