-- Track "what the end client releases" alongside the existing vendor/pay/bill
-- rates. Nullable everywhere ("if available" — the client's budget is often not
-- disclosed down the vendor chain). Not part of margin (margin = bill − pay).
ALTER TABLE "Job" ADD COLUMN "clientRate" DECIMAL(12,2);
ALTER TABLE "Submission" ADD COLUMN "clientRate" DECIMAL(12,2);
ALTER TABLE "Placement" ADD COLUMN "clientRate" DECIMAL(12,2);
ALTER TABLE "VendorRequirement" ADD COLUMN "clientRate" DECIMAL(12,2);
