-- Introduce a real three-tier role model (Manager / Team Lead / Recruiter),
-- replacing the ADMIN/RECRUITER enum + the isTeamLead boolean flag.
-- Step 1 (this migration): rename ADMIN -> MANAGER and add TEAM_LEAD.
-- The new value is NOT used here (Postgres forbids using a freshly-added enum
-- value in the same transaction); row migration + column drop happen next.
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'MANAGER';
ALTER TYPE "UserRole" ADD VALUE 'TEAM_LEAD';
