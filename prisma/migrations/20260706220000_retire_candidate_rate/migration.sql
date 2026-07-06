-- Retire the legacy single "Candidate rate". The client's process tracks only
-- Pay rate (what we pay the consultant) and Bill rate (what we receive), plus an
-- optional, often-undisclosed Client rate. All margin math keys off Bill - Pay.
ALTER TABLE "Job" DROP COLUMN "candidateRate";
ALTER TABLE "Submission" DROP COLUMN "candidateRate";
ALTER TABLE "VendorRequirement" DROP COLUMN "candidateRate";
