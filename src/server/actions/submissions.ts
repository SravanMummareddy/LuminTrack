"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ActivityAction,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import {
  submissionSchema,
  submissionEditSchema,
  statusChangeSchema,
} from "@/lib/validation/submission";
import { toFieldErrors } from "@/lib/validation/common";
import { SUBMISSION_STATUS_LABEL } from "@/lib/labels";
import type { FormState } from "@/lib/form-state";
import {
  ensurePlacementOnJoined,
  terminatePlacementOnRevert,
} from "@/server/placement-lifecycle";

/**
 * Maps a `(candidateId, jobId)` pair to two signed 32-bit integers, suitable
 * for `pg_advisory_xact_lock(int, int)`. Collisions across unrelated pairs
 * are harmless — at worst two unrelated submits serialize briefly. Same-pair
 * inputs always produce the same key, so concurrent submits to the same
 * (candidate, job) reliably gate on each other.
 */
function hashPair(a: string, b: string): { a: number; b: number } {
  const hash = (s: string) => {
    // djb2 — small, deterministic, no crypto dep. Final XOR fits int32.
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return h | 0;
  };
  return { a: hash(a), b: hash(b) };
}

function readSubmission(formData: FormData) {
  return submissionSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    jobId: formData.get("jobId") ?? "",
    submittedById: formData.get("submittedById") ?? "",
    candidateRate: formData.get("candidateRate") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
    resumeChoice: formData.get("resumeChoice") ?? "none",
    candidateResumeId: formData.get("candidateResumeId") ?? "",
    newResumeLabel: formData.get("newResumeLabel") ?? "",
    newResumeLink: formData.get("newResumeLink") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
  });
}

export async function createSubmission(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readSubmission(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const [job, candidate] = await Promise.all([
    prisma.job.findUnique({
      where: { id: d.jobId },
      select: {
        id: true,
        title: true,
        // iLabor signal fields — drive the cap + "closed for subs" warnings.
        submitLimit: true,
        ilaborSubmitOpen: true,
        externalActiveCount: true,
      },
    }),
    prisma.candidate.findUnique({
      where: { id: d.candidateId },
      select: { id: true, fullName: true },
    }),
  ]);
  if (!job) return { error: "This job no longer exists." };
  if (!candidate)
    return {
      error: "That candidate no longer exists.",
      fieldErrors: { candidateId: "Select a candidate." },
    };

  // §C4 — duplicate-submission check moved out of the DB to the action so
  // recruiters can override with a reason (e.g. role was rebooted, prior
  // submission was cancelled). The DB unique constraint was dropped in
  // migration `20260526150000_…`. Without `duplicateReason`, the action still
  // blocks the duplicate just like before.
  const duplicateReason = String(formData.get("duplicateReason") ?? "").trim();
  // iLabor override — same UX shape as the duplicate prompt, separate field
  // so the audit note can distinguish a cap/closed override from a duplicate
  // override.
  const ilaborOverrideReason = String(
    formData.get("ilaborOverrideReason") ?? "",
  ).trim();

  // Non-terminal submission statuses — i.e. ones that still count against
  // an iLabor cap. Excludes JOINED (slot already filled) and REJECTED
  // (no longer in pipeline). Matches iLabor's own "active" definition.
  const ACTIVE_STATUSES: SubmissionStatus[] = [
    "SUBMITTED",
    "RESUME_PICKED",
    "VENDOR_SCREENING_CALL",
    "CLIENT_INTERVIEW",
    "SELECTED",
    "ON_HOLD",
    "OFFER_RELEASED",
    "OFFER_ACCEPTED",
  ];

  // Resolve a previously-saved résumé up front so a bad pick returns cleanly.
  let pickedResume: { id: string; driveLink: string } | null = null;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: { id: true, driveLink: true, candidateId: true },
    });
    if (!resume || resume.candidateId !== d.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, driveLink: resume.driveLink };
  }

  // Two concurrent submits for the same (candidate, job) used to race past
  // the duplicate check because the findFirst lived outside the transaction.
  // We now wrap the check + create in one tx, gated by a Postgres advisory
  // lock keyed on a stable hash of both ids. Same-pair submits serialize;
  // unrelated pairs still run in parallel. Returns null from the tx when
  // we need to bail with `needsConfirm` so the caller can show the prompt.
  type CreateResult =
    | { kind: "created"; submissionId: string }
    | { kind: "duplicate" }
    | { kind: "ilabor_closed" }
    | { kind: "ilabor_cap"; cap: number; active: number };
  const lockHash = hashPair(d.candidateId, d.jobId);
  const result: CreateResult = await prisma.$transaction(async (tx) => {
      // pg_advisory_xact_lock blocks until acquired and auto-releases at tx
      // end. Two int4 keys derived from the (candidate, job) pair — see
      // hashPair() below for the encoding.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockHash.a}::int, ${lockHash.b}::int)`;

      const existing = await tx.submission.findFirst({
        where: { candidateId: d.candidateId, jobId: d.jobId },
        select: { id: true },
      });
      if (existing && !duplicateReason) return { kind: "duplicate" };

      // iLabor "closed for submissions" gate. Fires when iLabor's
      // submitStatus is 0 — independent of LuminTrack's job status. Override
      // with a reason; otherwise stop and prompt.
      if (job.ilaborSubmitOpen === 0 && !ilaborOverrideReason) {
        return { kind: "ilabor_closed" };
      }

      // iLabor cap gate. We compute the "effective" active count as the max
      // of iLabor's last-known active count and our local non-terminal sub
      // count, so locally-created subs we haven't re-imported don't slip
      // past the cap. Same lock + same tx means concurrent recruiters can't
      // race past the cap.
      if (job.submitLimit !== null && job.submitLimit !== undefined) {
        const localActive = await tx.submission.count({
          where: { jobId: d.jobId, status: { in: ACTIVE_STATUSES } },
        });
        const effectiveActive = Math.max(
          job.externalActiveCount ?? 0,
          localActive,
        );
        if (effectiveActive >= job.submitLimit && !ilaborOverrideReason) {
          return {
            kind: "ilabor_cap",
            cap: job.submitLimit,
            active: effectiveActive,
          };
        }
      }

      // Settle the résumé: an existing library entry, a new one, or none.
      let candidateResumeId: string | null = null;
      let resumeSnapshot: string | null = null;

      if (pickedResume) {
        candidateResumeId = pickedResume.id;
        resumeSnapshot = pickedResume.driveLink;
      } else if (
        d.resumeChoice === "new" &&
        d.newResumeLabel &&
        d.newResumeLink
      ) {
        const newResume = await tx.candidateResume.create({
          data: {
            candidateId: d.candidateId,
            label: d.newResumeLabel,
            driveLink: d.newResumeLink,
          },
        });
        candidateResumeId = newResume.id;
        resumeSnapshot = newResume.driveLink;
        await logActivity(tx, {
          entityType: "CANDIDATE",
          action: "RESUME_UPDATED",
          description: `Resume "${newResume.label}" added`,
          performedById: user.id,
          candidateId: d.candidateId,
        });
      }

      const created = await tx.submission.create({
        data: {
          candidateId: d.candidateId,
          jobId: d.jobId,
          submittedById: d.submittedById,
          candidateRate: d.candidateRate ?? null,
          candidateResumeId,
          // Snapshot the link used so it survives résumé edits/deletes.
          resumeDriveLink: resumeSnapshot,
          submissionNotes: d.submissionNotes ?? null,
          duplicateReason: existing ? duplicateReason : null,
          engagement: d.engagement ?? null,
          vendorRecruiterName: d.vendorRecruiterName ?? null,
          jobDuties: d.jobDuties ?? null,
        },
      });
      // Compose an audit note carrying every override reason that fired,
      // so the trail later explains why a submission got through despite
      // the duplicate / closed / cap gates.
      const notes: string[] = [];
      if (existing) notes.push(`duplicate:${duplicateReason}`);
      if (ilaborOverrideReason)
        notes.push(`ilabor-override:${ilaborOverrideReason}`);
      const description = existing
        ? `${candidate.fullName} re-submitted to "${job.title}" (duplicate override: ${duplicateReason})`
        : ilaborOverrideReason
          ? `${candidate.fullName} submitted to "${job.title}" (iLabor override: ${ilaborOverrideReason})`
          : `${candidate.fullName} submitted to "${job.title}"`;
      await logActivity(tx, {
        entityType: "SUBMISSION",
        action: "CANDIDATE_SUBMITTED",
        description,
        note: notes.length ? notes.join("; ") : null,
        performedById: user.id,
        submissionId: created.id,
      });
      return { kind: "created", submissionId: created.id };
  });

  if (result.kind === "duplicate") {
    return {
      needsConfirm: true,
      error: `${candidate.fullName} was already submitted to this job. Add a reason to submit again.`,
    };
  }
  if (result.kind === "ilabor_closed") {
    return {
      needsConfirm: true,
      error: `iLabor has closed submissions on this requisition. Add a reason to submit anyway.`,
    };
  }
  if (result.kind === "ilabor_cap") {
    return {
      needsConfirm: true,
      error: `iLabor's cap of ${result.cap} is reached (${result.active} active). Add a reason to submit past the cap.`,
    };
  }
  const submissionId = result.submissionId;

  revalidatePath("/submissions");
  revalidatePath(`/jobs/${d.jobId}`);
  revalidatePath(`/candidates/${d.candidateId}`);
  redirect(`/submissions/${submissionId}`);
}

function readSubmissionEdit(formData: FormData) {
  return submissionEditSchema.safeParse({
    candidateRate: formData.get("candidateRate") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
    submittedAt: formData.get("submittedAt") ?? "",
    resumeChoice: formData.get("resumeChoice") ?? "none",
    candidateResumeId: formData.get("candidateResumeId") ?? "",
    newResumeLabel: formData.get("newResumeLabel") ?? "",
    newResumeLink: formData.get("newResumeLink") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
  });
}

/**
 * Edits a submission's rate, résumé, and notes (spec §7.7). Candidate, job, and
 * submitting recruiter are fixed at creation and not editable here; status has
 * its own form (`changeSubmissionStatus`).
 */
export async function updateSubmission(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const submissionId = String(formData.get("id") ?? "").trim();
  if (!submissionId) return { error: "Missing submission reference." };

  const parsed = readSubmissionEdit(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      candidate: { select: { id: true, fullName: true } },
      job: { select: { id: true, title: true } },
    },
  });
  if (!existing) return { error: "This submission no longer exists." };

  // Resolve a previously-saved résumé up front so a bad pick returns cleanly.
  let pickedResume: { id: string; driveLink: string } | null = null;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: { id: true, driveLink: true, candidateId: true },
    });
    if (!resume || resume.candidateId !== existing.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, driveLink: resume.driveLink };
  }

  await prisma.$transaction(async (tx) => {
    // Settle the résumé: an existing library entry, a new one, or none.
    let candidateResumeId: string | null = null;
    let resumeSnapshot: string | null = null;

    if (pickedResume) {
      candidateResumeId = pickedResume.id;
      resumeSnapshot = pickedResume.driveLink;
    } else if (d.resumeChoice === "new" && d.newResumeLabel && d.newResumeLink) {
      const newResume = await tx.candidateResume.create({
        data: {
          candidateId: existing.candidateId,
          label: d.newResumeLabel,
          driveLink: d.newResumeLink,
        },
      });
      candidateResumeId = newResume.id;
      resumeSnapshot = newResume.driveLink;
      await logActivity(tx, {
        entityType: "CANDIDATE",
        action: "RESUME_UPDATED",
        description: `Resume "${newResume.label}" added`,
        performedById: user.id,
        candidateId: existing.candidateId,
      });
    }

    // Record which fields actually changed, for a meaningful audit entry.
    const changed: string[] = [];
    const compare = (label: string, before: unknown, after: unknown) => {
      if (String(before ?? "") !== String(after ?? "")) changed.push(label);
    };
    compare("candidate rate", existing.candidateRate?.toString(), d.candidateRate);
    compare("notes", existing.submissionNotes, d.submissionNotes);
    // Compare the submitted date at minute precision — the datetime-local input
    // only carries minutes, so a stored seconds component must not count as a change.
    if (
      Math.floor(existing.submittedAt.getTime() / 60000) !==
      Math.floor(d.submittedAt.getTime() / 60000)
    )
      changed.push("submitted date");
    if (
      String(existing.candidateResumeId ?? "") !== String(candidateResumeId ?? "") ||
      String(existing.resumeDriveLink ?? "") !== String(resumeSnapshot ?? "")
    )
      changed.push("resume");

    await tx.submission.update({
      where: { id: submissionId },
      data: {
        candidateRate: d.candidateRate ?? null,
        submissionNotes: d.submissionNotes ?? null,
        submittedAt: d.submittedAt,
        candidateResumeId,
        // Snapshot the link used so it survives résumé edits/deletes.
        resumeDriveLink: resumeSnapshot,
        engagement: d.engagement ?? null,
        vendorRecruiterName: d.vendorRecruiterName ?? null,
        jobDuties: d.jobDuties ?? null,
      },
    });

    if (changed.length)
      await logActivity(tx, {
        entityType: "SUBMISSION",
        action: "SUBMISSION_UPDATED",
        description: `${existing.candidate.fullName} on "${existing.job.title}": submission updated (${changed.join(", ")})`,
        newValue: changed.join(", "),
        performedById: user.id,
        submissionId,
      });
  });

  revalidatePath("/submissions");
  revalidatePath(`/submissions/${submissionId}`);
  revalidatePath(`/jobs/${existing.jobId}`);
  revalidatePath(`/candidates/${existing.candidateId}`);
  redirect(`/submissions/${submissionId}`);
}

/**
 * Manual submission status change from the submission detail page (spec §9.8).
 * Optionally records when the event really happened, a note, and (for Rejected
 * / On Hold) a reason category. Returns a `FormState` so the caller can
 * surface validation errors instead of silently dropping the click.
 */
export async function changeSubmissionStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = statusChangeSchema.safeParse({
    id: formData.get("id") ?? "",
    status: formData.get("status") ?? "",
    eventAt: formData.get("eventAt") ?? "",
    note: formData.get("note") ?? "",
    reason: formData.get("reason") ?? "",
    expectedJoinDate: formData.get("expectedJoinDate") ?? "",
    actualJoinDate: formData.get("actualJoinDate") ?? "",
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const submission = await prisma.submission.findUnique({
    where: { id: d.id },
    include: {
      candidate: { select: { id: true, fullName: true, status: true } },
      job: { select: { title: true } },
      placement: { select: { id: true, status: true } },
    },
  });
  if (!submission) return { error: "This submission no longer exists." };
  if (submission.status === d.status)
    return { error: "Status is already set to that value." };
  const next = d.status as SubmissionStatus;
  const prev = submission.status;

  // The reason category only applies to the Rejected / On Hold outcomes.
  const reason =
    next === "REJECTED" || next === "ON_HOLD" ? (d.reason ?? null) : null;

  // Emit the most specific audited action for the milestone statuses.
  const action: ActivityAction =
    next === "SELECTED"
      ? "CANDIDATE_SELECTED"
      : next === "REJECTED"
        ? "CANDIDATE_REJECTED"
        : next === "OFFER_RELEASED"
          ? "OFFER_RELEASED"
          : next === "OFFER_ACCEPTED"
            ? "OFFER_ACCEPTED"
            : next === "JOINED"
              ? "CANDIDATE_JOINED"
              : "SUBMISSION_STATUS_CHANGED";

  // §C2: expected join date attaches to OFFER_ACCEPTED, actual to JOINED.
  // We ignore either field when the new status doesn't accept it — keeps a
  // stale value off the row if a recruiter fills it out for the wrong status.
  const joinDates: { expectedJoinDate?: Date; actualJoinDate?: Date } = {};
  if (next === "OFFER_ACCEPTED" && d.expectedJoinDate)
    joinDates.expectedJoinDate = d.expectedJoinDate;
  if (next === "JOINED" && d.actualJoinDate)
    joinDates.actualJoinDate = d.actualJoinDate;

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: d.id },
      data: {
        status: next,
        // The note now carries the free-text detail the old rejection-reason
        // textarea did, so the detail page's "Rejection reason" block is unchanged.
        ...(next === "REJECTED" ? { rejectionReason: d.note ?? null } : {}),
        ...joinDates,
      },
    });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action,
      description: `${submission.candidate.fullName} on "${submission.job.title}": status changed from ${SUBMISSION_STATUS_LABEL[submission.status]} to ${SUBMISSION_STATUS_LABEL[next]}`,
      oldValue: SUBMISSION_STATUS_LABEL[submission.status],
      newValue: SUBMISSION_STATUS_LABEL[next],
      eventAt: d.eventAt ?? null,
      note: d.note ?? null,
      reason,
      performedById: user.id,
      submissionId: d.id,
    });

    // R4.2 — placement lifecycle hooks. Same transaction as the status change
    // so the placement state and the audit row commit together (audit invariant).
    if (next === "JOINED" && prev !== "JOINED") {
      await ensurePlacementOnJoined(tx, {
        submissionId: d.id,
        candidateId: submission.candidateId,
        jobId: submission.jobId,
        candidateRate: submission.candidateRate,
        candidateFullName: submission.candidate.fullName,
        jobTitle: submission.job.title,
        candidateStatus: submission.candidate.status,
        performedById: user.id,
        eventAt: d.actualJoinDate ?? d.eventAt ?? null,
      });
    } else if (
      prev === "JOINED" &&
      next !== "JOINED" &&
      submission.placement &&
      (submission.placement.status === "ACTIVE" ||
        submission.placement.status === "EXTENDED")
    ) {
      await terminatePlacementOnRevert(tx, {
        placementId: submission.placement.id,
        candidateId: submission.candidateId,
        candidateFullName: submission.candidate.fullName,
        candidateStatus: submission.candidate.status,
        newSubmissionStatus: SUBMISSION_STATUS_LABEL[next],
        performedById: user.id,
      });
    }
  });

  revalidatePath("/submissions");
  revalidatePath(`/submissions/${d.id}`);
  revalidatePath(`/jobs/${submission.jobId}`);
  revalidatePath(`/candidates/${submission.candidateId}`);
  return { ok: true };
}
