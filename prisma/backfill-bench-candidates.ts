/**
 * Backfill: give every unlinked BenchConsultant a Candidate.
 *
 * The bench is now candidate-first — every marketed consultant is a Candidate
 * (source of truth). Pre-existing bench rows created before that change may have
 * `candidateId = null`; this creates a Candidate from their shared fields and
 * links it, so they appear in the candidate list and are submittable.
 *
 *   npx tsx --env-file=.env prisma/backfill-bench-candidates.ts            # dry run
 *   npx tsx --env-file=.env prisma/backfill-bench-candidates.ts --confirm  # apply
 *
 * Idempotent: rows already linked are skipped; safe to re-run.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL / DATABASE_URL is not set. Fill in .env first.");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const confirm = process.argv.includes("--confirm");

  const orphans = await prisma.benchConsultant.findMany({
    where: { candidateId: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      currentLocation: true,
      workAuthorization: true,
      skills: true,
      createdById: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `${orphans.length} bench consultant(s) without a linked candidate.` +
      (confirm ? "" : " (dry run — pass --confirm to apply)"),
  );
  if (!orphans.length) return;

  let done = 0;
  for (const b of orphans) {
    console.log(`  • ${b.fullName}${confirm ? "" : " → would create candidate"}`);
    if (!confirm) continue;

    await prisma.$transaction(async (tx) => {
      const cand = await tx.candidate.create({
        data: {
          fullName: b.fullName,
          email: b.email,
          phone: b.phone,
          currentLocation: b.currentLocation,
          workAuthorization: b.workAuthorization,
          skills: b.skills,
          status: "AVAILABLE",
          isActive: true,
          createdById: b.createdById,
        },
        select: { id: true },
      });
      await tx.benchConsultant.update({
        where: { id: b.id },
        data: { candidateId: cand.id },
      });
    });
    done += 1;
  }

  console.log(confirm ? `Linked ${done} consultant(s) to new candidates.` : "Dry run complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
