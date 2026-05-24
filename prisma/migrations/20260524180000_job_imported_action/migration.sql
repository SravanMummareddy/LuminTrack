-- Phase 8a polish — per-job audit entry on iLabor imports.
-- Adds the JOB_IMPORTED action so each newly-imported job's timeline can
-- record its provenance, distinct from the bulk REQUISITIONS_IMPORTED summary.

ALTER TYPE "ActivityAction" ADD VALUE 'JOB_IMPORTED';
