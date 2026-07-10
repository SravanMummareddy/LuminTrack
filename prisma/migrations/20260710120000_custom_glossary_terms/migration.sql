-- Org-wide glossary terms added manually by admins/team-leads, on top of the
-- curated code list. Soft-deleted (deletedAt) so a term with private notes
-- hanging off its slug can be recovered.
CREATE TABLE "CustomGlossaryTerm" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CustomGlossaryTerm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomGlossaryTerm_term_key" ON "CustomGlossaryTerm"("term");
CREATE INDEX "CustomGlossaryTerm_createdById_idx" ON "CustomGlossaryTerm"("createdById");

ALTER TABLE "CustomGlossaryTerm" ADD CONSTRAINT "CustomGlossaryTerm_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
