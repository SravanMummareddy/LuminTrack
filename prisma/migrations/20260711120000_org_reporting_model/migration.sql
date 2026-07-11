-- Wave 1b: replace User.teamLabel with a real Team + reporting chain.

-- 1. Team table
CREATE TABLE "Team" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "leadId"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");
CREATE INDEX "Team_leadId_idx" ON "Team"("leadId");

-- 2. New User columns (nullable — no default needed)
ALTER TABLE "User" ADD COLUMN "teamId"      TEXT;
ALTER TABLE "User" ADD COLUMN "reportsToId" TEXT;

-- 3a. One Team per distinct teamLabel among TEAM_LEAD + RECRUITER only, so a
--     manager-only label never spawns a phantom team.
INSERT INTO "Team" ("id", "name", "leadId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t.label, NULL, now(), now()
FROM (
  SELECT DISTINCT "teamLabel" AS label
  FROM "User"
  WHERE "teamLabel" IS NOT NULL
    AND "role" IN ('TEAM_LEAD','RECRUITER')
) t;

-- 3b. leadId = a TEAM_LEAD whose old label matches. Deterministic pick (active
--     first, then lowest id) when a label has multiple TLs.
UPDATE "Team" tm
SET "leadId" = (
  SELECT u."id" FROM "User" u
  WHERE u."role" = 'TEAM_LEAD' AND u."teamLabel" = tm."name"
  ORDER BY u."isActive" DESC, u."id" ASC
  LIMIT 1
);

-- 3c. teamId for every TL + recruiter (managers left NULL by the role filter, so
--     a manager who happened to carry a teamLabel ends up teamId = NULL).
UPDATE "User" u
SET "teamId" = tm."id"
FROM "Team" tm
WHERE tm."name" = u."teamLabel"
  AND u."role" IN ('TEAM_LEAD','RECRUITER');

-- 3d. reportsToId: recruiter -> its team's lead.
UPDATE "User" u
SET "reportsToId" = tm."leadId"
FROM "Team" tm
WHERE u."teamId" = tm."id"
  AND u."role" = 'RECRUITER'
  AND tm."leadId" IS NOT NULL
  AND tm."leadId" <> u."id";

-- 3e. reportsToId: team lead -> the manager, only when exactly one MANAGER
--     exists. Ambiguous multi-manager orgs are left NULL for the seed/owner to
--     wire the CEO chain. Managers stay reportsTo = NULL (apex).
UPDATE "User" u
SET "reportsToId" = (SELECT m."id" FROM "User" m WHERE m."role" = 'MANAGER' ORDER BY m."id" LIMIT 1)
WHERE u."role" = 'TEAM_LEAD'
  AND (SELECT count(*) FROM "User" WHERE "role" = 'MANAGER') = 1;

-- 4. FKs + indexes (added after backfill; all referenced rows already exist).
ALTER TABLE "Team" ADD CONSTRAINT "Team_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_teamId_idx"      ON "User"("teamId");
CREATE INDEX "User_reportsToId_idx" ON "User"("reportsToId");

ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_reportsToId_fkey"
    FOREIGN KEY ("reportsToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Drop the old free-text column (all readers rewired in this wave).
ALTER TABLE "User" DROP COLUMN "teamLabel";
