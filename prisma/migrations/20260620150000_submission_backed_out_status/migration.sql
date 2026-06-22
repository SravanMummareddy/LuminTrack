-- Adds the BACKED_OUT terminal outcome to SubmissionStatus (powers the
-- Monthly Performance "Backouts" metric). Standalone migration: Postgres
-- cannot ADD VALUE and then USE that value in the same transactional
-- migration, so the value is only referenced by later application code.
ALTER TYPE "SubmissionStatus" ADD VALUE 'BACKED_OUT';
