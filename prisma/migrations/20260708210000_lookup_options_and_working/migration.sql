-- Learned free-text lookups: work authorization, "working now" type, call type,
-- payroll type. A curated default list is unioned with these stored values so a
-- newly-typed value reappears in the dropdown next time (owner's "store for
-- future reference"). One row per (category, value); the app upserts on save.
CREATE TABLE "LookupOption" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LookupOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LookupOption_category_value_key" ON "LookupOption"("category", "value");
CREATE INDEX "LookupOption_category_idx" ON "LookupOption"("category");

-- "Working now?" is a property of the person (may be an external engagement not
-- tracked as a Placement here) — independent of Placement, which records only
-- engagements that went through us.
ALTER TABLE "Candidate" ADD COLUMN "isWorking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN "workingType" TEXT;
