-- §B4 / §E2 / §E3 / §E4 — Candidate engagement metadata.

CREATE TYPE "CandidateStatus" AS ENUM ('AVAILABLE', 'PLACED', 'NOT_INTERESTED', 'DO_NOT_CONTACT');

ALTER TYPE "ActivityAction" ADD VALUE 'CANDIDATE_CONTACTED';

ALTER TABLE "Candidate"
  ADD COLUMN "status" "CandidateStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lastContactedAt" TIMESTAMP(3),
  ADD COLUMN "source" TEXT;

CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");
