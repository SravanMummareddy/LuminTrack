-- Add distinct audit actions for résumé add/delete and interview round delete.
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'RESUME_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'RESUME_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_DELETED';
