-- Phase 7 — Display-ID sequences for Job, Candidate, Submission.
--
-- We add an integer `seq` column to each table, backfill it in createdAt order
-- (oldest row gets 1), wire up a Postgres sequence so new rows auto-fill, and
-- add the UNIQUE constraint Prisma expects from `@unique @default(autoincrement())`.
-- The id (cuid) stays the source of truth for foreign keys; `seq` is purely
-- for human-facing IDs like JOB-00123 / CAND-001 / SUB-001.

-- ─── Job ────────────────────────────────────────────────────────────────────
ALTER TABLE "Job" ADD COLUMN "seq" INTEGER;
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Job"
)
UPDATE "Job" SET "seq" = ordered.rn
FROM ordered WHERE "Job".id = ordered.id;

CREATE SEQUENCE "Job_seq_seq" OWNED BY "Job"."seq";
SELECT setval('"Job_seq_seq"', GREATEST(COALESCE((SELECT MAX("seq") FROM "Job"), 0), 1));
ALTER TABLE "Job" ALTER COLUMN "seq" SET DEFAULT nextval('"Job_seq_seq"');
ALTER TABLE "Job" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "Job" ADD CONSTRAINT "Job_seq_key" UNIQUE ("seq");

-- ─── Candidate ──────────────────────────────────────────────────────────────
ALTER TABLE "Candidate" ADD COLUMN "seq" INTEGER;
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Candidate"
)
UPDATE "Candidate" SET "seq" = ordered.rn
FROM ordered WHERE "Candidate".id = ordered.id;

CREATE SEQUENCE "Candidate_seq_seq" OWNED BY "Candidate"."seq";
SELECT setval('"Candidate_seq_seq"', GREATEST(COALESCE((SELECT MAX("seq") FROM "Candidate"), 0), 1));
ALTER TABLE "Candidate" ALTER COLUMN "seq" SET DEFAULT nextval('"Candidate_seq_seq"');
ALTER TABLE "Candidate" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_seq_key" UNIQUE ("seq");

-- ─── Submission ─────────────────────────────────────────────────────────────
ALTER TABLE "Submission" ADD COLUMN "seq" INTEGER;
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Submission"
)
UPDATE "Submission" SET "seq" = ordered.rn
FROM ordered WHERE "Submission".id = ordered.id;

CREATE SEQUENCE "Submission_seq_seq" OWNED BY "Submission"."seq";
SELECT setval('"Submission_seq_seq"', GREATEST(COALESCE((SELECT MAX("seq") FROM "Submission"), 0), 1));
ALTER TABLE "Submission" ALTER COLUMN "seq" SET DEFAULT nextval('"Submission_seq_seq"');
ALTER TABLE "Submission" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_seq_key" UNIQUE ("seq");
