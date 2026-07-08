-- Right-to-be-forgotten: mark a candidate whose personal data has been erased
-- (name/contact fields blanked + résumé/document files shredded). The row is
-- kept so submissions/placements/metrics stay intact, just anonymized.
ALTER TABLE "Candidate" ADD COLUMN "erasedAt" TIMESTAMP(3);
ALTER TYPE "ActivityAction" ADD VALUE 'CANDIDATE_ERASED';
