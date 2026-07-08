-- Step 2: existing team leads were MANAGER (formerly ADMIN) + isTeamLead=true.
-- Promote them to the TEAM_LEAD role, then drop the now-redundant flag column.
UPDATE "User" SET "role" = 'TEAM_LEAD' WHERE "isTeamLead" = true;
ALTER TABLE "User" DROP COLUMN "isTeamLead";
