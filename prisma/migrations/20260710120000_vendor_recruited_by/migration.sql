-- Vendor "Recruited by": our team member who owns the vendor relationship.
-- Linked user (recruitedById, SetNull) OR a free-typed name (recruitedByName).
ALTER TABLE "Vendor" ADD COLUMN "recruitedById" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "recruitedByName" TEXT;

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_recruitedById_fkey"
  FOREIGN KEY ("recruitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Vendor_recruitedById_idx" ON "Vendor"("recruitedById");
