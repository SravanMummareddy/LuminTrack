-- Audit action for editing a submission's rate / résumé / notes, mirroring
-- JOB_UPDATED and CANDIDATE_UPDATED.

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'SUBMISSION_UPDATED' AFTER 'SUBMISSION_STATUS_CHANGED';
