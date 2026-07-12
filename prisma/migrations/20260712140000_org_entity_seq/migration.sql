-- Display-ID sequences for the org entities (Client / Vendor / SisterCompanySource /
-- Referrer) so each becomes a first-class record (CLI-/VEN-/SRC-/REF-), plus the
-- "Direct" source-type retirement (DIRECT → OTHER; default flips to OTHER).

-- ── Client.seq ──────────────────────────────────────────────────────────────
CREATE SEQUENCE "Client_seq_seq" AS INTEGER;
ALTER TABLE "Client" ADD COLUMN "seq" INTEGER;
UPDATE "Client" c SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "Client") sub
  WHERE c.id = sub.id;
SELECT setval('"Client_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Client"), 0) + 1, false);
ALTER TABLE "Client" ALTER COLUMN "seq" SET DEFAULT nextval('"Client_seq_seq"');
ALTER TABLE "Client" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "Client_seq_seq" OWNED BY "Client"."seq";
CREATE UNIQUE INDEX "Client_seq_key" ON "Client"("seq");

-- ── Vendor.seq ──────────────────────────────────────────────────────────────
CREATE SEQUENCE "Vendor_seq_seq" AS INTEGER;
ALTER TABLE "Vendor" ADD COLUMN "seq" INTEGER;
UPDATE "Vendor" v SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "Vendor") sub
  WHERE v.id = sub.id;
SELECT setval('"Vendor_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Vendor"), 0) + 1, false);
ALTER TABLE "Vendor" ALTER COLUMN "seq" SET DEFAULT nextval('"Vendor_seq_seq"');
ALTER TABLE "Vendor" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "Vendor_seq_seq" OWNED BY "Vendor"."seq";
CREATE UNIQUE INDEX "Vendor_seq_key" ON "Vendor"("seq");

-- ── SisterCompanySource.seq ─────────────────────────────────────────────────
CREATE SEQUENCE "SisterCompanySource_seq_seq" AS INTEGER;
ALTER TABLE "SisterCompanySource" ADD COLUMN "seq" INTEGER;
UPDATE "SisterCompanySource" s SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "SisterCompanySource") sub
  WHERE s.id = sub.id;
SELECT setval('"SisterCompanySource_seq_seq"', COALESCE((SELECT MAX("seq") FROM "SisterCompanySource"), 0) + 1, false);
ALTER TABLE "SisterCompanySource" ALTER COLUMN "seq" SET DEFAULT nextval('"SisterCompanySource_seq_seq"');
ALTER TABLE "SisterCompanySource" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "SisterCompanySource_seq_seq" OWNED BY "SisterCompanySource"."seq";
CREATE UNIQUE INDEX "SisterCompanySource_seq_key" ON "SisterCompanySource"("seq");

-- ── Referrer.seq ────────────────────────────────────────────────────────────
CREATE SEQUENCE "Referrer_seq_seq" AS INTEGER;
ALTER TABLE "Referrer" ADD COLUMN "seq" INTEGER;
UPDATE "Referrer" r SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "Referrer") sub
  WHERE r.id = sub.id;
SELECT setval('"Referrer_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Referrer"), 0) + 1, false);
ALTER TABLE "Referrer" ALTER COLUMN "seq" SET DEFAULT nextval('"Referrer_seq_seq"');
ALTER TABLE "Referrer" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "Referrer_seq_seq" OWNED BY "Referrer"."seq";
CREATE UNIQUE INDEX "Referrer_seq_key" ON "Referrer"("seq");

-- ── Retire "Direct" source type ─────────────────────────────────────────────
-- Keep the enum value (Postgres enum-value removal is heavy) but stop using it:
-- flip the default and migrate existing rows to OTHER.
ALTER TABLE "Job" ALTER COLUMN "sourceType" SET DEFAULT 'OTHER';
UPDATE "Job" SET "sourceType" = 'OTHER' WHERE "sourceType" = 'DIRECT';
