-- bugs.md Round 3 §B1 — per-entity contact records.
-- Polymorphic-ish: exactly one of (clientId, vendorId, sourceId) is set per
-- row. The CHECK constraint enforces that at the DB level so a future client
-- can't silently insert "orphan" contacts.

CREATE TABLE "Contact" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "email"     TEXT,
  "phone"     TEXT,
  "role"      TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "clientId"  TEXT,
  "vendorId"  TEXT,
  "sourceId"  TEXT,

  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Contact_exactly_one_parent" CHECK (
    (CASE WHEN "clientId" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "vendorId" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "sourceId" IS NULL THEN 0 ELSE 1 END) = 1
  )
);

CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");
CREATE INDEX "Contact_vendorId_idx" ON "Contact"("vendorId");
CREATE INDEX "Contact_sourceId_idx" ON "Contact"("sourceId");

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "SisterCompanySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
