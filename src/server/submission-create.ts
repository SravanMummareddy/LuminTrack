import type { BenchEngagement } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { logActivity } from "@/server/activity";
import { activateBenchOnSubmission } from "@/server/bench-lifecycle";

/**
 * Maps a `(candidateId, jobId)` pair to two signed 32-bit integers, suitable
 * for `pg_advisory_xact_lock(int, int)`. Collisions across unrelated pairs
 * are harmless — at worst two unrelated submits serialize briefly. Same-pair
 * inputs always produce the same key, so concurrent submits to the same
 * (candidate, job) reliably gate on each other.
 */
export function hashPair(a: string, b: string): { a: number; b: number } {
  const hash = (s: string) => {
    // djb2 — small, deterministic, no crypto dep. Final XOR fits int32.
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return h | 0;
  };
  return { a: hash(a), b: hash(b) };
}

export type CreateSubmissionResult =
  | { kind: "created"; submissionId: string }
  | { kind: "duplicate"; existingId: string };

export type SubmissionRecordInput = {
  candidateId: string;
  jobId: string;
  submittedById: string;
  submissionNotes: string | null;
  engagement: BenchEngagement | null;
  vendorRecruiterName: string | null;
  jobDuties: string | null;
  payRate: number | null;
  billRate: number | null;
  clientRate: number | null;
  teamLead: string | null;
  /** A pre-resolved library résumé to reuse — its uploaded blob URL is snapshot
   *  onto the submission. */
  pickedResume: { id: string; blobUrl: string | null } | null;
  /** Override reasons — empty string means "not provided" (gate still blocks). */
  duplicateReason: string;
  /** Free-text reason logged when the recruiter saves past a broken rate chain.
   *  The gate itself lives in the calling action; this only records it. */
  rateOverrideReason?: string;
  /** Free-text reason logged when submitting a Not-interested / Do-not-contact
   *  candidate. The gate lives in the calling action; this only records it. */
  candidateStatusOverrideReason?: string;
  /** Free-text reason logged when submitting an Off-bench candidate. The gate
   *  lives in the calling action; this only records it. */
  benchOverrideReason?: string;
  /** Pre-loaded job identity for the audit text. */
  job: {
    id: string;
    title: string;
  };
  candidateFullName: string;
  actor: { id: string; fullName: string; isAdmin: boolean };
};

/**
 * Creates a Submission row inside a caller-supplied transaction, enforcing the
 * duplicate gate, self-claiming the job for a non-admin recruiter, settling the
 * résumé, and writing the CANDIDATE_SUBMITTED audit row. Returns a discriminated
 * union instead of throwing for the overridable duplicate gate, so both the
 * direct-submit action and the requirement→submission convert flow can surface a
 * `needsConfirm` prompt.
 *
 * MUST run inside an open `prisma.$transaction` — it takes a
 * `pg_advisory_xact_lock` on the (candidate, job) pair so concurrent submits to
 * the same pair serialize on the duplicate + cap checks.
 */
export async function createSubmissionRecord(
  tx: Tx,
  input: SubmissionRecordInput,
): Promise<CreateSubmissionResult> {
  const lockHash = hashPair(input.candidateId, input.jobId);
  // pg_advisory_xact_lock blocks until acquired and auto-releases at tx end.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockHash.a}::int, ${lockHash.b}::int)`;

  const existing = await tx.submission.findFirst({
    where: { candidateId: input.candidateId, jobId: input.jobId },
    select: { id: true },
  });
  if (existing && !input.duplicateReason)
    return { kind: "duplicate", existingId: existing.id };

  // Self-claim: a non-admin submitting to a job they don't own gets assigned to
  // it here, in the same tx, so ownership and the submission commit together.
  if (!input.actor.isAdmin) {
    const owned = await tx.jobAssignment.findFirst({
      where: { jobId: input.jobId, recruiterId: input.actor.id },
      select: { id: true },
    });
    if (!owned) {
      await tx.jobAssignment.upsert({
        where: {
          jobId_recruiterId: { jobId: input.jobId, recruiterId: input.actor.id },
        },
        create: {
          jobId: input.jobId,
          recruiterId: input.actor.id,
          assignedById: input.actor.id,
        },
        update: {},
      });
      await logActivity(tx, {
        entityType: "JOB",
        action: "RECRUITER_ASSIGNED",
        description: `${input.actor.fullName} claimed this job`,
        performedById: input.actor.id,
        jobId: input.jobId,
      });
    }
  }

  // Attribution guard (the real fix — the "Submitted by" picker is UI-only).
  // Only privileged users (managers / team leads, i.e. actor.isAdmin ===
  // canReattributeSubmission) may credit a submission to someone else; everyone
  // else is forced to themselves. Enforced here in the shared record helper so
  // BOTH entry points — direct create and VPR convert — are covered, and a
  // recruiter can't forge scorecard attribution via a crafted request.
  const submittedById = input.actor.isAdmin
    ? input.submittedById
    : input.actor.id;

  // Settle the résumé: an existing library entry or none. Snapshot its blob URL
  // so the submission's record survives the library row being edited/archived.
  let candidateResumeId: string | null = null;
  let blobSnapshot: string | null = null;
  if (input.pickedResume) {
    candidateResumeId = input.pickedResume.id;
    blobSnapshot = input.pickedResume.blobUrl;
  }

  const created = await tx.submission.create({
    data: {
      candidateId: input.candidateId,
      jobId: input.jobId,
      submittedById,
      candidateResumeId,
      // Snapshot the résumé's blob URL so it survives library edits/deletes.
      resumeBlobUrl: blobSnapshot,
      submissionNotes: input.submissionNotes ?? null,
      duplicateReason: existing ? input.duplicateReason : null,
      engagement: input.engagement ?? null,
      vendorRecruiterName: input.vendorRecruiterName ?? null,
      jobDuties: input.jobDuties ?? null,
      payRate: input.payRate ?? null,
      billRate: input.billRate ?? null,
      clientRate: input.clientRate ?? null,
      teamLead: input.teamLead ?? null,
    },
  });

  // Compose an audit note carrying every override reason that fired.
  const notes: string[] = [];
  if (existing) notes.push(`duplicate:${input.duplicateReason}`);
  if (input.rateOverrideReason)
    notes.push(`rate-override:${input.rateOverrideReason}`);
  if (input.candidateStatusOverrideReason)
    notes.push(`candidate-override:${input.candidateStatusOverrideReason}`);
  if (input.benchOverrideReason)
    notes.push(`bench-override:${input.benchOverrideReason}`);
  const description = existing
    ? `${input.candidateFullName} re-submitted to "${input.job.title}" (duplicate override: ${input.duplicateReason})`
    : `${input.candidateFullName} submitted to "${input.job.title}"`;
  await logActivity(tx, {
    entityType: "SUBMISSION",
    action: "CANDIDATE_SUBMITTED",
    description,
    note: notes.length ? notes.join("; ") : null,
    performedById: input.actor.id,
    submissionId: created.id,
  });
  // A submission is an act of marketing — keep the bench honest: reactivate an
  // Off-bench row (or create one if missing). Leaves PAUSED/PLACED/ACTIVE alone.
  await activateBenchOnSubmission(tx, {
    candidateId: input.candidateId,
    recruiterId: submittedById,
    performedById: input.actor.id,
  });
  return { kind: "created", submissionId: created.id };
}
