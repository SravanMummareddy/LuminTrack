/**
 * Reconcile VPR status against the parent job's status.
 *
 * A requirement should never sit OPEN under a terminal job — the runtime cascade
 * (changeJobStatus / bulkChangeJobStatus) already flips OPEN VPRs to CONVERTED
 * (job FILLED) or CANCELLED (job CLOSED/CANCELLED). But seed/backfill data can
 * set a job terminal and a VPR OPEN independently, leaving the misleading
 * "job Filled, requirement still Open" state. This one-off aligns them.
 *
 *   npx tsx --env-file=.env prisma/reconcile-vpr-status.ts            # dry run
 *   npx tsx --env-file=.env prisma/reconcile-vpr-status.ts --confirm  # apply
 *
 * Idempotent: once reconciled, re-runs find nothing.
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

  // OPEN VPRs whose job is terminal, split by the resulting status so we mirror
  // the runtime cascade exactly (FILLED → CONVERTED, else → CANCELLED).
  const stale = await prisma.vendorRequirement.findMany({
    where: { status: "OPEN", job: { status: { in: ["FILLED", "CLOSED", "CANCELLED"] } } },
    select: { id: true, seq: true, job: { select: { title: true, status: true } } },
  });

  if (stale.length === 0) {
    console.log("✓ No OPEN requirements under terminal jobs — nothing to reconcile.");
    await prisma.$disconnect();
    return;
  }

  const toConverted = stale.filter((r) => r.job.status === "FILLED");
  const toCancelled = stale.filter((r) => r.job.status !== "FILLED");

  console.log(`Found ${stale.length} OPEN requirement(s) under a terminal job:`);
  for (const r of stale) {
    const next = r.job.status === "FILLED" ? "CONVERTED" : "CANCELLED";
    console.log(
      `  VPR-${String(r.seq).padStart(3, "0")}  job "${r.job.title}" (${r.job.status})  →  ${next}`,
    );
  }

  if (!confirm) {
    console.log("\nDry run. Re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  const [conv, canc] = await prisma.$transaction([
    prisma.vendorRequirement.updateMany({
      where: { id: { in: toConverted.map((r) => r.id) } },
      data: { status: "CONVERTED" },
    }),
    prisma.vendorRequirement.updateMany({
      where: { id: { in: toCancelled.map((r) => r.id) } },
      data: { status: "CANCELLED" },
    }),
  ]);

  console.log(`\n✓ Reconciled: ${conv.count} → CONVERTED, ${canc.count} → CANCELLED.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
