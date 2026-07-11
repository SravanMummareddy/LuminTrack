-- Phase C — multi-tenancy foundation.
-- Adds the Organization tenant boundary, backfills every tenant-owned row into a
-- single default org, and swaps the 8 name/identity uniques to composite
-- (organizationId, …). Data-safe: organizationId is added NULLABLE, backfilled,
-- then set NOT NULL, so it applies cleanly to a populated database. Additive and
-- backward-compatible — the currently-deployed code ignores the new column, so
-- this can be applied to prod ahead of the code that needs it. See CLAUDE.md.

-- ── 1. Tenant table + the single default org all existing data belongs to ──────
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" ("id", "name", "slug", "isActive", "updatedAt")
VALUES ('org_lumintrack_default', 'LuminTrack', 'lumintrack', true, CURRENT_TIMESTAMP);

-- ── 2. Drop the global name/identity uniques that become composite per-org ──────
DROP INDEX "Client_name_key";
DROP INDEX "CustomGlossaryTerm_term_key";
DROP INDEX "LookupOption_category_value_key";
DROP INDEX "Role_name_key";
DROP INDEX "Role_systemRole_key";
DROP INDEX "SisterCompanySource_name_key";
DROP INDEX "Team_name_key";
DROP INDEX "Vendor_name_key";

-- ── 3. User.isPlatformAdmin (defaulted, safe) + Team.updatedAt default drop ─────
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- ── 4. Add organizationId (nullable → backfill → NOT NULL) on every tenant table ─
ALTER TABLE "Activity" ADD COLUMN "organizationId" TEXT;
UPDATE "Activity" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Activity" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "BenchConsultant" ADD COLUMN "organizationId" TEXT;
UPDATE "BenchConsultant" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "BenchConsultant" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Candidate" ADD COLUMN "organizationId" TEXT;
UPDATE "Candidate" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Candidate" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "CandidateDocument" ADD COLUMN "organizationId" TEXT;
UPDATE "CandidateDocument" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "CandidateDocument" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "CandidateResume" ADD COLUMN "organizationId" TEXT;
UPDATE "CandidateResume" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "CandidateResume" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Client" ADD COLUMN "organizationId" TEXT;
UPDATE "Client" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Client" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Contact" ADD COLUMN "organizationId" TEXT;
UPDATE "Contact" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Contact" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "CustomGlossaryTerm" ADD COLUMN "organizationId" TEXT;
UPDATE "CustomGlossaryTerm" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "CustomGlossaryTerm" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "GlossaryNote" ADD COLUMN "organizationId" TEXT;
UPDATE "GlossaryNote" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "GlossaryNote" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "InterviewRound" ADD COLUMN "organizationId" TEXT;
UPDATE "InterviewRound" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "InterviewRound" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Job" ADD COLUMN "organizationId" TEXT;
UPDATE "Job" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Job" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "JobAssignment" ADD COLUMN "organizationId" TEXT;
UPDATE "JobAssignment" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "JobAssignment" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "LookupOption" ADD COLUMN "organizationId" TEXT;
UPDATE "LookupOption" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "LookupOption" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Note" ADD COLUMN "organizationId" TEXT;
UPDATE "Note" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Note" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Placement" ADD COLUMN "organizationId" TEXT;
UPDATE "Placement" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Placement" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "PlacementExtension" ADD COLUMN "organizationId" TEXT;
UPDATE "PlacementExtension" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "PlacementExtension" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Role" ADD COLUMN "organizationId" TEXT;
UPDATE "Role" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Role" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "RolePermission" ADD COLUMN "organizationId" TEXT;
UPDATE "RolePermission" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "RolePermission" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "SisterCompanySource" ADD COLUMN "organizationId" TEXT;
UPDATE "SisterCompanySource" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "SisterCompanySource" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Submission" ADD COLUMN "organizationId" TEXT;
UPDATE "Submission" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Submission" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "SupportProvider" ADD COLUMN "organizationId" TEXT;
UPDATE "SupportProvider" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "SupportProvider" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Team" ADD COLUMN "organizationId" TEXT;
UPDATE "Team" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Team" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
UPDATE "User" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Vendor" ADD COLUMN "organizationId" TEXT;
UPDATE "Vendor" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "Vendor" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "VendorRequirement" ADD COLUMN "organizationId" TEXT;
UPDATE "VendorRequirement" SET "organizationId" = 'org_lumintrack_default';
ALTER TABLE "VendorRequirement" ALTER COLUMN "organizationId" SET NOT NULL;

-- ── 5. Indexes: per-org lookup index + the composite uniques ────────────────────
CREATE INDEX "Activity_organizationId_idx" ON "Activity"("organizationId");
CREATE INDEX "BenchConsultant_organizationId_idx" ON "BenchConsultant"("organizationId");
CREATE INDEX "Candidate_organizationId_idx" ON "Candidate"("organizationId");
CREATE INDEX "CandidateDocument_organizationId_idx" ON "CandidateDocument"("organizationId");
CREATE INDEX "CandidateResume_organizationId_idx" ON "CandidateResume"("organizationId");
CREATE INDEX "Client_organizationId_idx" ON "Client"("organizationId");
CREATE UNIQUE INDEX "Client_organizationId_name_key" ON "Client"("organizationId", "name");
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");
CREATE INDEX "CustomGlossaryTerm_organizationId_idx" ON "CustomGlossaryTerm"("organizationId");
CREATE UNIQUE INDEX "CustomGlossaryTerm_organizationId_term_key" ON "CustomGlossaryTerm"("organizationId", "term");
CREATE INDEX "GlossaryNote_organizationId_idx" ON "GlossaryNote"("organizationId");
CREATE INDEX "InterviewRound_organizationId_idx" ON "InterviewRound"("organizationId");
CREATE INDEX "Job_organizationId_idx" ON "Job"("organizationId");
CREATE INDEX "JobAssignment_organizationId_idx" ON "JobAssignment"("organizationId");
CREATE INDEX "LookupOption_organizationId_idx" ON "LookupOption"("organizationId");
CREATE UNIQUE INDEX "LookupOption_organizationId_category_value_key" ON "LookupOption"("organizationId", "category", "value");
CREATE INDEX "Note_organizationId_idx" ON "Note"("organizationId");
CREATE INDEX "Placement_organizationId_idx" ON "Placement"("organizationId");
CREATE INDEX "PlacementExtension_organizationId_idx" ON "PlacementExtension"("organizationId");
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");
CREATE UNIQUE INDEX "Role_organizationId_systemRole_key" ON "Role"("organizationId", "systemRole");
CREATE INDEX "RolePermission_organizationId_idx" ON "RolePermission"("organizationId");
CREATE INDEX "SisterCompanySource_organizationId_idx" ON "SisterCompanySource"("organizationId");
CREATE UNIQUE INDEX "SisterCompanySource_organizationId_name_key" ON "SisterCompanySource"("organizationId", "name");
CREATE INDEX "Submission_organizationId_idx" ON "Submission"("organizationId");
CREATE INDEX "SupportProvider_organizationId_idx" ON "SupportProvider"("organizationId");
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");
CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "Team"("organizationId", "name");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "Vendor_organizationId_idx" ON "Vendor"("organizationId");
CREATE UNIQUE INDEX "Vendor_organizationId_name_key" ON "Vendor"("organizationId", "name");
CREATE INDEX "VendorRequirement_organizationId_idx" ON "VendorRequirement"("organizationId");

-- ── 6. Foreign keys to Organization ─────────────────────────────────────────────
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SisterCompanySource" ADD CONSTRAINT "SisterCompanySource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateResume" ADD CONSTRAINT "CandidateResume_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchConsultant" ADD CONSTRAINT "BenchConsultant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlacementExtension" ADD CONSTRAINT "PlacementExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportProvider" ADD CONSTRAINT "SupportProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorRequirement" ADD CONSTRAINT "VendorRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LookupOption" ADD CONSTRAINT "LookupOption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GlossaryNote" ADD CONSTRAINT "GlossaryNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomGlossaryTerm" ADD CONSTRAINT "CustomGlossaryTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 7. Promote the founding admin to platform super-admin ───────────────────────
-- The earliest-created MANAGER (the org founder — seed admin on dev, sriman on
-- prod) becomes the platform super-admin who can manage organizations.
UPDATE "User" SET "isPlatformAdmin" = true
WHERE "id" = (SELECT "id" FROM "User" WHERE "role" = 'MANAGER' ORDER BY "createdAt" ASC LIMIT 1);
