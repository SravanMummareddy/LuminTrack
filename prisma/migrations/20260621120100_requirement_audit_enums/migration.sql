-- Vendor Portal Requirements — audit enum value adds. Kept separate from the
-- table migration (20260621120000) because these ADD VALUE on PRE-EXISTING enums
-- (EntityType, ActivityAction); the values are referenced only by later
-- application code (separate transactions), never within a migration — honoring
-- the "can't ADD VALUE and USE it in the same transaction" Postgres rule.

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'REQUIREMENT_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'REQUIREMENT_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'REQUIREMENT_CONVERTED';
ALTER TYPE "ActivityAction" ADD VALUE 'REQUIREMENT_CANCELLED';

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'REQUIREMENT';
