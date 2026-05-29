import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Idempotently ensure a SisterCompanySource row mirrors the given JobPortal
 * name. Returns its id.
 *
 * Convention: when a new JobPortal upsert is added anywhere (seed, importer,
 * admin tool), call this immediately after. The Sources list under
 * Settings → Sources then stays in sync with the JobPortal list automatically,
 * and imported jobs can be attributed via Job.sisterCompanySourceId so the
 * Source column / filter resolves cleanly instead of falling back to the
 * portal name in jobSourceLabel().
 */
export async function ensureSourceForPortal(
  db: Db,
  portalName: string,
): Promise<string> {
  const row = await db.sisterCompanySource.upsert({
    where: { name: portalName },
    update: {},
    create: {
      name: portalName,
      notes: `Auto-created — mirrors job portal "${portalName}".`,
    },
    select: { id: true },
  });
  return row.id;
}
