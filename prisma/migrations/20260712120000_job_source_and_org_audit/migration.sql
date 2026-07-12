-- Job source rework + estimated-start flag, org-entity audit columns, Referrer directory.

-- 1. New enum for where a job came from.
CREATE TYPE "JobSourceType" AS ENUM ('JOB_BOARD', 'REFERRAL', 'SISTER_COMPANY', 'DIRECT', 'OTHER');

-- 2. Referrer directory (reusable people who refer jobs to us).
CREATE TABLE "Referrer" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT '',
    "name"           TEXT NOT NULL,
    "email"          TEXT,
    "phone"          TEXT,
    "company"        TEXT,
    "notes"          TEXT,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdById"    TEXT,
    "updatedById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Referrer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Referrer_organizationId_name_key" ON "Referrer"("organizationId", "name");
CREATE INDEX "Referrer_organizationId_idx" ON "Referrer"("organizationId");
ALTER TABLE "Referrer" ADD CONSTRAINT "Referrer_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referrer" ADD CONSTRAINT "Referrer_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Referrer" ADD CONSTRAINT "Referrer_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Created/updated-by audit columns on the admin-list entities.
ALTER TABLE "Client" ADD COLUMN "createdById" TEXT, ADD COLUMN "updatedById" TEXT;
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vendor" ADD COLUMN "createdById" TEXT, ADD COLUMN "updatedById" TEXT;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SisterCompanySource" ADD COLUMN "createdById" TEXT, ADD COLUMN "updatedById" TEXT;
ALTER TABLE "SisterCompanySource" ADD CONSTRAINT "SisterCompanySource_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SisterCompanySource" ADD CONSTRAINT "SisterCompanySource_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Job: new source fields + estimated-start flag.
ALTER TABLE "Job" ADD COLUMN "sourceType" "JobSourceType" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "Job" ADD COLUMN "jobBoard" TEXT;
ALTER TABLE "Job" ADD COLUMN "referrerId" TEXT;
ALTER TABLE "Job" ADD COLUMN "startDateEstimated" BOOLEAN NOT NULL DEFAULT false;

-- 5. Backfill sourceType from existing data (else stays DIRECT).
UPDATE "Job" SET "sourceType" = 'SISTER_COMPANY' WHERE "sisterCompanySourceId" IS NOT NULL;
UPDATE "Job" SET "sourceType" = 'OTHER'
    WHERE "sisterCompanySourceId" IS NULL AND "sourceOther" IS NOT NULL AND "sourceOther" <> '';

-- 6. Job → Referrer FK + index.
CREATE INDEX "Job_referrerId_idx" ON "Job"("referrerId");
ALTER TABLE "Job" ADD CONSTRAINT "Job_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Drop the retired Job columns (owner-confirmed removal; low-value ATS leftovers).
ALTER TABLE "Job" DROP COLUMN "atsId";
ALTER TABLE "Job" DROP COLUMN "durationLabel";
ALTER TABLE "Job" DROP COLUMN "reqType";
ALTER TABLE "Job" DROP COLUMN "department";
