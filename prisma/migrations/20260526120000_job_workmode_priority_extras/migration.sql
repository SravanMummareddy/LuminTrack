-- bugs.md Round 3 §A2 — surface LuminTrack-native job-planning fields the
-- iLabor importer doesn't carry: work mode, priority, target hire-by date,
-- public posting URL, work-authorization requirement, and a structured
-- skills array that mirrors Candidate.skills for downstream matching.

CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

ALTER TABLE "Job"
  ADD COLUMN "workMode" "WorkMode",
  ADD COLUMN "priority" "JobPriority",
  ADD COLUMN "targetCloseDate" TIMESTAMP(3),
  ADD COLUMN "postingUrl" TEXT,
  ADD COLUMN "workAuthRequirement" TEXT,
  ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
