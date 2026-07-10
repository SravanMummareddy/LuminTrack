-- External interview-support individuals (tracked so recruiters can reach them)
-- + the link from an interview round to who supported it and how.
CREATE TABLE "SupportProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reference" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportProvider_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InterviewRound" ADD COLUMN "supportProviderId" TEXT;
ALTER TABLE "InterviewRound" ADD COLUMN "supportMethod" TEXT;

ALTER TABLE "InterviewRound" ADD CONSTRAINT "InterviewRound_supportProviderId_fkey"
  FOREIGN KEY ("supportProviderId") REFERENCES "SupportProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InterviewRound_supportProviderId_idx" ON "InterviewRound"("supportProviderId");
