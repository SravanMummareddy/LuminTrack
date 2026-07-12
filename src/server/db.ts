import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";
import { orgScopeExtension } from "@/server/org-scope";

// Re-export the already-imported binding for callers that reach it via
// `@/server/db` (seed, tests). Equivalent to `export … from "@/server/org-scope"`
// but without importing the module a second time.
export { orgScopeExtension };

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * The UNSCOPED base client. It sees every tenant's data, so it is the deliberate
 * escape hatch — use it ONLY for:
 *   • the `getCurrentUser` bootstrap (we load the user by id to *learn* their org),
 *   • the health check + advisory locks (touch no tenant rows),
 *   • platform super-admin cross-org operations (managing Organizations).
 * Everything else must go through `scopedPrisma(orgId)` / `getScopedPrisma()` so
 * the tenant boundary is enforced centrally. See src/lib/session.ts.
 */
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ─── Multi-tenancy enforcement (Phase C) ──────────────────────────────────────
/**
 * A tenant-scoped Prisma client. Built per request (cheap — it wraps the same
 * PrismaClient + Neon pool via the `orgScopeExtension`). `orgId` is closed over at
 * construction, so start transactions from THIS client
 * (`scopedPrisma(orgId).$transaction(...)`) and the `tx` handed to the callback
 * stays scoped too.
 *
 * NOTE (nested writes): the extension stamps the TOP-LEVEL model's data/where.
 * Nested relation creates (`data: { rounds: { create: [...] } }`) are NOT stamped
 * — pass `organizationId` explicitly there, or create the child in its own call.
 */
export function scopedPrisma(orgId: string) {
  return prisma.$extends(orgScopeExtension(orgId));
}

/** The tenant-scoped client type — what `getScopedPrisma()` resolves to. */
export type ScopedPrisma = ReturnType<typeof scopedPrisma>;

/**
 * The transaction-client type handed to a `scopedPrisma(...).$transaction`
 * callback. A client `$extends` produces a distinct (branded) client type whose
 * tx is NOT assignable to the vanilla `Prisma.TransactionClient`, so shared
 * transaction helpers (logActivity, createSubmissionRecord, the lifecycle
 * helpers) must type their `tx` param as this. The full `ScopedPrisma` is
 * assignable to it too, so passing the client directly (outside a tx) still works.
 */
export type Tx = Omit<
  ScopedPrisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** True when a write failed because of a unique-constraint violation (Prisma P2002). */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
