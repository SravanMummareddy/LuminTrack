-- Bench-Sales "Placements" tab fields (June-19 requirements). All additive + nullable.
ALTER TABLE "Placement" ADD COLUMN "organisation" TEXT;
ALTER TABLE "Placement" ADD COLUMN "teamLead" TEXT;
ALTER TABLE "Placement" ADD COLUMN "interviewDate" TIMESTAMP(3);
ALTER TABLE "Placement" ADD COLUMN "placementDate" TIMESTAMP(3);
ALTER TABLE "Placement" ADD COLUMN "remarks" TEXT;
