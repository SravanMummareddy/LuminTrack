// Bench lifecycle helpers. The owner's model: the Bench is "who we're marketing
// right now." A candidate is represented on the bench by a `BenchConsultant`
// linked 1:1 (the marketing identity), and its `marketingStatus` drives on/off
// the active bench (ACTIVE/PAUSED = on bench, PLACED/INACTIVE = off). These
// helpers keep that membership in sync with the candidate/placement lifecycle.
//
// Every helper takes a Prisma transaction client so the caller composes the
// write + its audit row atomically (audit invariant).

import type { Prisma } from "@/generated/prisma/client";
import type { BenchMarketingStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/server/activity";

type Tx = Prisma.TransactionClient;

/**
 * Ensures a candidate has a linked bench presence. Called when a candidate is
 * created AVAILABLE so every marketed candidate shows up on the bench. Idempotent
 * — no-ops if a `BenchConsultant` is already linked to this candidate (the
 * `candidateId` column is `@unique`). Seeds the marketing identity from the
 * candidate's own fields; the recruiter fills in marketing-specific details later.
 *
 * Caller must wrap in `prisma.$transaction`.
 */
export async function ensureBenchForCandidate(
  tx: Tx,
  args: {
    candidateId: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    currentLocation?: string | null;
    workAuthorization?: string | null;
    skills?: string[];
    recruiterId?: string | null;
    performedById: string;
  },
): Promise<void> {
  const existing = await tx.benchConsultant.findUnique({
    where: { candidateId: args.candidateId },
    select: { id: true },
  });
  if (existing) return; // already on the bench

  const created = await tx.benchConsultant.create({
    data: {
      fullName: args.fullName,
      email: args.email ?? null,
      phone: args.phone ?? null,
      currentLocation: args.currentLocation ?? null,
      workAuthorization: args.workAuthorization ?? null,
      // A Visa = the actual visa = the candidate's work authorization.
      aVisa: args.workAuthorization ?? null,
      skills: args.skills ?? [],
      // On the bench, actively being marketed, until placed or removed.
      marketingStatus: "ACTIVE",
      candidateId: args.candidateId,
      recruiterId: args.recruiterId ?? null,
      createdById: args.performedById,
    },
    select: { id: true },
  });
  await logActivity(tx, {
    entityType: "CONSULTANT",
    action: "BENCH_CONSULTANT_CREATED",
    description: `Bench consultant "${args.fullName}" added (auto from candidate)`,
    performedById: args.performedById,
    benchConsultantId: created.id,
  });
}

/**
 * Flips the marketing status of a candidate's linked bench record — PLACED when
 * the candidate joins (rolls off the active bench), ACTIVE when a placement ends
 * and they're back to being marketed. No-ops if the candidate has no linked bench
 * record, or it's already in the target status.
 *
 * Caller must wrap in `prisma.$transaction`.
 */
export async function syncBenchOnPlacement(
  tx: Tx,
  args: {
    candidateId: string;
    marketingStatus: BenchMarketingStatus;
    performedById: string;
  },
): Promise<void> {
  const bench = await tx.benchConsultant.findUnique({
    where: { candidateId: args.candidateId },
    select: { id: true, marketingStatus: true },
  });
  if (!bench || bench.marketingStatus === args.marketingStatus) return;

  await tx.benchConsultant.update({
    where: { id: bench.id },
    data: { marketingStatus: args.marketingStatus },
  });
  await logActivity(tx, {
    entityType: "CONSULTANT",
    action: "BENCH_CONSULTANT_UPDATED",
    description: `Bench marketing status changed from ${bench.marketingStatus} to ${args.marketingStatus} (placement lifecycle)`,
    oldValue: bench.marketingStatus,
    newValue: args.marketingStatus,
    performedById: args.performedById,
    benchConsultantId: bench.id,
  });
}
