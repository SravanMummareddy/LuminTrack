-- WS4 — display-ID sequences for the admin entities (User / Team / Role /
-- Organization / CustomGlossaryTerm) so each becomes a first-class record
-- (USR-/TEAM-/ROLE-/ORG-/GLO-), mirroring the org-entity seq migration. Additive:
-- backfill existing rows in createdAt order, then attach the default + unique.

-- ── User.seq ────────────────────────────────────────────────────────────────
CREATE SEQUENCE "User_seq_seq" AS INTEGER;
ALTER TABLE "User" ADD COLUMN "seq" INTEGER;
UPDATE "User" u SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "User") sub
  WHERE u.id = sub.id;
SELECT setval('"User_seq_seq"', COALESCE((SELECT MAX("seq") FROM "User"), 0) + 1, false);
ALTER TABLE "User" ALTER COLUMN "seq" SET DEFAULT nextval('"User_seq_seq"');
ALTER TABLE "User" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "User_seq_seq" OWNED BY "User"."seq";
CREATE UNIQUE INDEX "User_seq_key" ON "User"("seq");

-- ── Team.seq ────────────────────────────────────────────────────────────────
CREATE SEQUENCE "Team_seq_seq" AS INTEGER;
ALTER TABLE "Team" ADD COLUMN "seq" INTEGER;
UPDATE "Team" t SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "Team") sub
  WHERE t.id = sub.id;
SELECT setval('"Team_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Team"), 0) + 1, false);
ALTER TABLE "Team" ALTER COLUMN "seq" SET DEFAULT nextval('"Team_seq_seq"');
ALTER TABLE "Team" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "Team_seq_seq" OWNED BY "Team"."seq";
CREATE UNIQUE INDEX "Team_seq_key" ON "Team"("seq");

-- ── Role.seq ────────────────────────────────────────────────────────────────
CREATE SEQUENCE "Role_seq_seq" AS INTEGER;
ALTER TABLE "Role" ADD COLUMN "seq" INTEGER;
UPDATE "Role" r SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "Role") sub
  WHERE r.id = sub.id;
SELECT setval('"Role_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Role"), 0) + 1, false);
ALTER TABLE "Role" ALTER COLUMN "seq" SET DEFAULT nextval('"Role_seq_seq"');
ALTER TABLE "Role" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "Role_seq_seq" OWNED BY "Role"."seq";
CREATE UNIQUE INDEX "Role_seq_key" ON "Role"("seq");

-- ── Organization.seq ────────────────────────────────────────────────────────
CREATE SEQUENCE "Organization_seq_seq" AS INTEGER;
ALTER TABLE "Organization" ADD COLUMN "seq" INTEGER;
UPDATE "Organization" o SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "Organization") sub
  WHERE o.id = sub.id;
SELECT setval('"Organization_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Organization"), 0) + 1, false);
ALTER TABLE "Organization" ALTER COLUMN "seq" SET DEFAULT nextval('"Organization_seq_seq"');
ALTER TABLE "Organization" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "Organization_seq_seq" OWNED BY "Organization"."seq";
CREATE UNIQUE INDEX "Organization_seq_key" ON "Organization"("seq");

-- ── CustomGlossaryTerm.seq ──────────────────────────────────────────────────
CREATE SEQUENCE "CustomGlossaryTerm_seq_seq" AS INTEGER;
ALTER TABLE "CustomGlossaryTerm" ADD COLUMN "seq" INTEGER;
UPDATE "CustomGlossaryTerm" g SET "seq" = sub.rn
  FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "CustomGlossaryTerm") sub
  WHERE g.id = sub.id;
SELECT setval('"CustomGlossaryTerm_seq_seq"', COALESCE((SELECT MAX("seq") FROM "CustomGlossaryTerm"), 0) + 1, false);
ALTER TABLE "CustomGlossaryTerm" ALTER COLUMN "seq" SET DEFAULT nextval('"CustomGlossaryTerm_seq_seq"');
ALTER TABLE "CustomGlossaryTerm" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "CustomGlossaryTerm_seq_seq" OWNED BY "CustomGlossaryTerm"."seq";
CREATE UNIQUE INDEX "CustomGlossaryTerm_seq_key" ON "CustomGlossaryTerm"("seq");
