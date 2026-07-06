/**
 * One-off backfill — creates a Placement row for every submission already in
 * JOINED status that doesn't have one. Seeds rates from the submission's
 * `billRate`/`payRate` (else $0/$0 with "Rates pending" surfacing in the UI).
 * Start date prefers the
 * JOINED audit row's `eventAt`, falls back to `actualJoinDate`, then the
 * submission's createdAt. Logged as `PLACEMENT_CREATED` with `note: "backfill"`.
 * Also flips `Candidate.status → PLACED` for any candidate not already there.
 *
 * Idempotent: re-running is safe — submissions that already have a Placement
 * are skipped (Placement.submissionId @unique).
 *
 *   npx tsx prisma/backfill-placements.ts
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
  // Pick an admin to attribute the synthetic Placement/activity rows to.
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "TEAM_LEAD"] }, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.error("No active admin user found; aborting.");
    process.exit(1);
  }

  const joined = await prisma.submission.findMany({
    where: { status: "JOINED" },
    select: {
      id: true,
      candidateId: true,
      jobId: true,
      billRate: true,
      payRate: true,
      actualJoinDate: true,
      createdAt: true,
      candidate: { select: { fullName: true, status: true } },
      job: { select: { title: true } },
      placement: { select: { id: true } },
    },
  });
  console.log(`Found ${joined.length} JOINED submissions to consider.`);

  let created = 0;
  let skipped = 0;
  let statusFlipped = 0;

  for (const sub of joined) {
    if (sub.placement) {
      skipped += 1;
      continue;
    }

    // Try to find the JOINED audit row for a better startDate.
    const joinedAudit = await prisma.activity.findFirst({
      where: { submissionId: sub.id, action: "CANDIDATE_JOINED" },
      select: { eventAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const startDate =
      joinedAudit?.eventAt ??
      sub.actualJoinDate ??
      joinedAudit?.createdAt ??
      sub.createdAt;

    await prisma.$transaction(async (tx) => {
      const placement = await tx.placement.create({
        data: {
          submissionId: sub.id,
          candidateId: sub.candidateId,
          jobId: sub.jobId,
          startDate,
          billRate: sub.billRate ?? 0,
          payRate: sub.payRate ?? 0,
        },
        select: { id: true, seq: true },
      });
      await tx.activity.create({
        data: {
          entityType: "SUBMISSION",
          action: "PLACEMENT_CREATED",
          description: `Placement PLC-${String(placement.seq).padStart(3, "0")} created for ${sub.candidate.fullName} on "${sub.job.title}" (backfill)`,
          note: "backfill",
          performedById: admin.id,
          submissionId: sub.id,
          candidateId: sub.candidateId,
          jobId: sub.jobId,
        },
      });

      if (sub.candidate.status !== "PLACED") {
        await tx.candidate.update({
          where: { id: sub.candidateId },
          data: { status: "PLACED" },
        });
        await tx.activity.create({
          data: {
            entityType: "CANDIDATE",
            action: "CANDIDATE_STATUS_CHANGED",
            description: `${sub.candidate.fullName}: status changed from ${sub.candidate.status} to PLACED (backfill)`,
            oldValue: sub.candidate.status,
            newValue: "PLACED",
            note: "backfill",
            performedById: admin.id,
            candidateId: sub.candidateId,
          },
        });
        statusFlipped += 1;
      }
    });
    created += 1;
  }

  console.log(
    `Done. Created ${created} placements, skipped ${skipped} (already had one), flipped ${statusFlipped} candidates to PLACED.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
