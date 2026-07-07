-- User-management + self-service audit trail.
-- Adds an entity type for User and three actions so account changes
-- (create/update by an admin, and self-service password change) leave an
-- audit row like every other mutation in the app.
ALTER TYPE "EntityType" ADD VALUE 'USER';
ALTER TYPE "ActivityAction" ADD VALUE 'USER_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'USER_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'USER_PASSWORD_CHANGED';
