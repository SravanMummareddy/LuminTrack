-- Phase C — sentinel default on organizationId.
-- A '' default makes `organizationId` OPTIONAL in the Prisma create input type,
-- so the scoped-client extension (src/server/db.ts) can inject the real org at
-- runtime without every create site restating it (logActivity etc.). The value
-- '' is never persisted for a scoped create (the extension overrides it); a
-- base-client create that omits the org inserts '' and fails the FK loudly —
-- fail-closed. Keeps schema ↔ DB in sync for future `migrate diff`.
ALTER TABLE "Activity" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "BenchConsultant" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Candidate" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "CandidateDocument" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "CandidateResume" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Client" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Contact" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "CustomGlossaryTerm" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "GlossaryNote" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "InterviewRound" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Job" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "JobAssignment" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "LookupOption" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Note" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Placement" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "PlacementExtension" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Role" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "RolePermission" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "SisterCompanySource" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Submission" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "SupportProvider" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Team" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "User" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "Vendor" ALTER COLUMN "organizationId" SET DEFAULT '';
ALTER TABLE "VendorRequirement" ALTER COLUMN "organizationId" SET DEFAULT '';
