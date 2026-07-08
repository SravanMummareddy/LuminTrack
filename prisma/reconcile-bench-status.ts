/**
 * Reconcile the retired bench `isActive` axis into `marketingStatus`.
 *
 * The bench lifecycle used to have TWO independent axes — `isActive` (an "Active
 * on bench" checkbox) and `marketingStatus` — which could contradict each other
 * (e.g. isActive=false while marketingStatus=PAUSED). We collapsed to a single
 * axis (`marketingStatus`, labelled On bench / Paused / Placed / Off bench). Any
 * row previously retired via isActive=false should read as Off bench (INACTIVE).
 * This one-off flips those rows so nothing is lost, then the app ignores
 * `isActive` entirely.
 *
 *   npx tsx --env-file=.env prisma/reconcile-bench-status.ts            # dry run
 *   npx tsx --env-file=.env prisma/reconcile-bench-status.ts --confirm  # apply
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

  // Rows retired via the old isActive flag but not yet reflected in the status.
  const stale = await prisma.benchConsultant.findMany({
    where: { isActive: false, marketingStatus: { not: "INACTIVE" } },
    select: { id: true, seq: true, fullName: true, marketingStatus: true },
  });

  if (stale.length === 0) {
    console.log("✓ No isActive=false rows with a non-Off-bench status — nothing to reconcile.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${stale.length} retired bench row(s) to mark Off bench:`);
  for (const r of stale) {
    console.log(
      `  BC-${String(r.seq).padStart(3, "0")}  ${r.fullName}  (${r.marketingStatus} → INACTIVE)`,
    );
  }

  if (!confirm) {
    console.log("\nDry run. Re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  const res = await prisma.benchConsultant.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { marketingStatus: "INACTIVE" },
  });

  console.log(`\n✓ Reconciled: ${res.count} row(s) → Off bench (INACTIVE).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
