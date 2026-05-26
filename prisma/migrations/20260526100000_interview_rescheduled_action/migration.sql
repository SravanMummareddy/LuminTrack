-- bugs.md Round 3 §D4 — interview reschedule audit row.
-- Adds INTERVIEW_RESCHEDULED so a changed scheduledAt logs a discrete
-- timeline entry instead of silently overwriting the previous time.

ALTER TYPE "ActivityAction" ADD VALUE 'INTERVIEW_RESCHEDULED';
