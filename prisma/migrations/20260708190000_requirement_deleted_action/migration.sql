-- AlterEnum
-- Standalone value add (Postgres can't add + use an enum value in one tx) so an
-- empty VendorRequirement can be hard-deleted with a durable audit trail on its job.
ALTER TYPE "ActivityAction" ADD VALUE 'REQUIREMENT_DELETED';
