/**
 * One-off backfill — ensure every JobPortal has a same-named SisterCompanySource
 * row, and attribute existing imported Jobs to it (only where
 * Job.sisterCompanySourceId IS NULL — admin-attributed jobs are left alone).
 *
 * Generic: picks up every portal in the DB, not just Randstad. Idempotent.
 *
 *   npx tsx prisma/backfill-portal-sources.ts
 */
import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureSourceForPortal } from "../src/server/portals";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Fill in .env before running.");
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

async function main() {
  const portals = await prisma.jobPortal.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (portals.length === 0) {
    console.log("No JobPortals in DB. Nothing to backfill.");
    return;
  }
  console.log(`Found ${portals.length} portal(s).`);

  let totalUpdated = 0;
  for (const portal of portals) {
    const sourceId = await ensureSourceForPortal(prisma, portal.name);
    const { count } = await prisma.job.updateMany({
      where: { portalId: portal.id, sisterCompanySourceId: null },
      data: { sisterCompanySourceId: sourceId },
    });
    console.log(
      `  ${portal.name.padEnd(30)} → source ${sourceId} · ${count} job(s) attributed`,
    );
    totalUpdated += count;
  }
  console.log(`\nDone. ${totalUpdated} job(s) attributed in total.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
