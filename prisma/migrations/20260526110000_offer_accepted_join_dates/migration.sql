-- bugs.md Round 3 §C1 + §C2 — pipeline tail accuracy.
-- §C1: insert OFFER_ACCEPTED between OFFER_RELEASED and JOINED. In practice
--      candidates accept an offer and join 2-6 weeks later; today the
--      pipeline jumps OFFER_RELEASED → JOINED so the gap is invisible.
-- §C2: split the join milestone into expectedJoinDate (set when the offer is
--      accepted) and actualJoinDate (set when the candidate actually joins).
--      submittedAt only tracks pipeline entry, not pipeline exit.

ALTER TYPE "SubmissionStatus" ADD VALUE 'OFFER_ACCEPTED' BEFORE 'JOINED';
ALTER TYPE "ActivityAction" ADD VALUE 'OFFER_ACCEPTED' AFTER 'OFFER_RELEASED';

ALTER TABLE "Submission"
  ADD COLUMN "expectedJoinDate" TIMESTAMP(3),
  ADD COLUMN "actualJoinDate" TIMESTAMP(3);
