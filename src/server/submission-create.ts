import type { Prisma } from "@/generated/prisma/client";
import type {
  BenchEngagement,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { logActivity } from "@/server/activity";

type Tx = Prisma.TransactionClient;

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

// Non-terminal submission statuses — i.e. ones that still count against an
// iLabor cap. Excludes JOINED (slot already filled) and REJECTED (no longer in
// pipeline). Matches iLabor's own "active" definition.
export const ACTIVE_STATUSES: SubmissionStatus[] = [
  "SUBMITTED",
  "RESUME_PICKED",
  "VENDOR_SCREENING_CALL",
  "CLIENT_INTERVIEW",
  "SELECTED",
  "ON_HOLD",
  "OFFER_RELEASED",
  "OFFER_ACCEPTED",
];

export type CreateSubmissionResult =
  | { kind: "created"; submissionId: string }
  | { kind: "duplicate"; existingId: string }
  | { kind: "ilabor_closed" }
  | { kind: "ilabor_cap"; cap: number; active: number };

export type SubmissionRecordInput = {
  candidateId: string;
  jobId: string;
  submittedById: string;
  candidateRate: number | null;
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
  ilaborOverrideReason: string;
  /** Pre-loaded job signal fields driving the iLabor gates + audit text. */
  job: {
    id: string;
    title: string;
    submitLimit: number | null;
    ilaborSubmitOpen: number | null;
    externalActiveCount: number | null;
  };
  candidateFullName: string;
  actor: { id: string; fullName: string; isAdmin: boolean };
};

/**
 * Creates a Submission row inside a caller-supplied transaction, enforcing the
 * shared gates (duplicate, iLabor closed/cap), self-claiming the job for a
 * non-admin recruiter, settling the résumé, and writing the CANDIDATE_SUBMITTED
 * audit row. Returns a discriminated union instead of throwing for the
 * overridable gates, so both the direct-submit action and the
 * requirement→submission convert flow can surface a `needsConfirm` prompt.
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

  // iLabor "closed for submissions" gate — fires when iLabor's submitStatus is
  // 0, independent of LuminTrack's job status. Override with a reason.
  if (input.job.ilaborSubmitOpen === 0 && !input.ilaborOverrideReason) {
    return { kind: "ilabor_closed" };
  }

  // iLabor cap gate. Effective active = max(iLabor's last-known count, our local
  // non-terminal count) so locally-created subs can't slip past the cap.
  if (input.job.submitLimit !== null && input.job.submitLimit !== undefined) {
    const localActive = await tx.submission.count({
      where: { jobId: input.jobId, status: { in: ACTIVE_STATUSES } },
    });
    const effectiveActive = Math.max(
      input.job.externalActiveCount ?? 0,
      localActive,
    );
    if (effectiveActive >= input.job.submitLimit && !input.ilaborOverrideReason) {
      return {
        kind: "ilabor_cap",
        cap: input.job.submitLimit,
        active: effectiveActive,
      };
    }
  }

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
      submittedById: input.submittedById,
      candidateRate: input.candidateRate ?? null,
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
  if (input.ilaborOverrideReason)
    notes.push(`ilabor-override:${input.ilaborOverrideReason}`);
  const description = existing
    ? `${input.candidateFullName} re-submitted to "${input.job.title}" (duplicate override: ${input.duplicateReason})`
    : input.ilaborOverrideReason
      ? `${input.candidateFullName} submitted to "${input.job.title}" (iLabor override: ${input.ilaborOverrideReason})`
      : `${input.candidateFullName} submitted to "${input.job.title}"`;
  await logActivity(tx, {
    entityType: "SUBMISSION",
    action: "CANDIDATE_SUBMITTED",
    description,
    note: notes.length ? notes.join("; ") : null,
    performedById: input.actor.id,
    submissionId: created.id,
  });
  return { kind: "created", submissionId: created.id };
}
