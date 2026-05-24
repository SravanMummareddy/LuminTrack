/**
 * One-off backfill — adds a JOB_IMPORTED activity entry for every iLabor-linked
 * Job that doesn't already have one. Dates the entry to the job's createdAt so
 * the timeline reflects when the job actually landed in LuminTrack.
 *
 * Idempotent: re-running is safe — jobs that already have a JOB_IMPORTED row
 * are skipped.
 *
 *   npx tsx prisma/backfill-job-imported.ts
 */
import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Fill in .env before running.");
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

async function main() {
  // All jobs that came from a JobPortal (i.e. were imported, not manually entered).
  const jobs = await prisma.job.findMany({
    where: { portalId: { not: null } },
    select: {
      id: true,
      portalRefId: true,
      createdAt: true,
      createdById: true,
      portal: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${jobs.length} imported jobs to consider.`);

  // Which of those already have a JOB_IMPORTED audit row?
  const existingAudits = await prisma.activity.findMany({
    where: {
      action: "JOB_IMPORTED",
      jobId: { in: jobs.map((j) => j.id) },
    },
    select: { jobId: true },
  });
  const alreadyAudited = new Set(existingAudits.map((a) => a.jobId));
  console.log(`${alreadyAudited.size} already have a JOB_IMPORTED entry.`);

  const toCreate = jobs.filter((j) => !alreadyAudited.has(j.id));
  console.log(`Backfilling ${toCreate.length} entries…`);

  // Bulk insert. createdAt is set explicitly so the timeline reflects when the
  // job actually came in, not when this script ran.
  if (toCreate.length > 0) {
    await prisma.activity.createMany({
      data: toCreate.map((j) => ({
        entityType: "JOB" as const,
        action: "JOB_IMPORTED" as const,
        jobId: j.id,
        description: `Imported from ${j.portal?.name ?? "external portal"}${j.portalRefId ? ` (Req ${j.portalRefId})` : ""}`,
        performedById: j.createdById,
        createdAt: j.createdAt,
      })),
    });
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
