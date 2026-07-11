-- Overseers/admins who sit outside the reporting hierarchy are hidden from the
-- org chart. Defaults true so every existing user still appears.
ALTER TABLE "User" ADD COLUMN "showInOrgChart" BOOLEAN NOT NULL DEFAULT true;
