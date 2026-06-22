import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Test-only Prisma client. Talks to the disposable Docker Postgres (plain
// `pg` adapter, NOT the Neon adapter the app uses) at DATABASE_URL_TEST. The
// integration tests mock `@/server/db` to return THIS client, so the real
// server actions run their real queries + cascades against a real database.
export const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:postgres@localhost:5433/lumintrack_test";

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: TEST_DB_URL }),
});

/** Mirror of the app's helper — Prisma normalises unique violations to P2002
 *  regardless of driver adapter, so the same check works on `pg`. */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
