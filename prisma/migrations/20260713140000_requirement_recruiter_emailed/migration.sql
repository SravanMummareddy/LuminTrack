-- Wave 7.1 — audit action for "team lead emailed the assigned recruiter about a
-- VPR". Additive enum value; Postgres allows ADD VALUE in a transaction on PG16.
ALTER TYPE "ActivityAction" ADD VALUE 'REQUIREMENT_RECRUITER_EMAILED';
