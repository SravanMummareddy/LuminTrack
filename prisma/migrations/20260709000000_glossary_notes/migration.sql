-- Per-user glossary notes. The term list + definitions are curated in code
-- (src/lib/glossary.ts); this table stores only each user's private note,
-- keyed by the stable term slug. One note per (user, term).
CREATE TABLE "GlossaryNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GlossaryNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlossaryNote_userId_term_key" ON "GlossaryNote"("userId", "term");
CREATE INDEX "GlossaryNote_userId_idx" ON "GlossaryNote"("userId");

ALTER TABLE "GlossaryNote" ADD CONSTRAINT "GlossaryNote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
