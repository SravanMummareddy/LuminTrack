-- Wave 4 strict pipeline: "scheduled but didn't happen" interview outcomes.
-- Additive enum values; existing rounds keep their results. Postgres 12+ allows
-- ALTER TYPE ... ADD VALUE inside a transaction as long as the value isn't used
-- in the same transaction (it isn't).
ALTER TYPE "InterviewResult" ADD VALUE IF NOT EXISTS 'NO_SHOW';
ALTER TYPE "InterviewResult" ADD VALUE IF NOT EXISTS 'CANCELLED';
