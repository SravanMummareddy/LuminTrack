-- Wave 7 — per-user email opt-outs. Additive, both default true so existing
-- users keep receiving until they opt out.
ALTER TABLE "User" ADD COLUMN "notifyDigest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyEvents" BOOLEAN NOT NULL DEFAULT true;
