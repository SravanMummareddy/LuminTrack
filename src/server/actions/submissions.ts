"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
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
      select: { id: true, title: true },
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

  let submissionId: string;
  try {
    submissionId = await prisma.$transaction(async (tx) => {
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
        },
      });
      await logActivity(tx, {
        entityType: "SUBMISSION",
        action: "CANDIDATE_SUBMITTED",
        description: `${candidate.fullName} submitted to "${job.title}"`,
        performedById: user.id,
        submissionId: created.id,
      });
      return created.id;
    });
  } catch (e) {
    // Unique [candidateId, jobId] — spec §12: no duplicate candidate per job.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        error: `${candidate.fullName} has already been submitted to this job.`,
        fieldErrors: {
          candidateId: "This candidate is already submitted to this job.",
        },
      };
    }
    throw e;
  }

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
 * / On Hold) a reason category. Stays `void`-returning — every extra field is
 * optional, so a parse failure just no-ops.
 */
export async function changeSubmissionStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = statusChangeSchema.safeParse({
    id: formData.get("id") ?? "",
    status: formData.get("status") ?? "",
    eventAt: formData.get("eventAt") ?? "",
    note: formData.get("note") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return;
  const d = parsed.data;

  const submission = await prisma.submission.findUnique({
    where: { id: d.id },
    include: {
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
    },
  });
  if (!submission || submission.status === d.status) return;
  const next = d.status as SubmissionStatus;

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
          : next === "JOINED"
            ? "CANDIDATE_JOINED"
            : "SUBMISSION_STATUS_CHANGED";

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: d.id },
      data: {
        status: next,
        // The note now carries the free-text detail the old rejection-reason
        // textarea did, so the detail page's "Rejection reason" block is unchanged.
        ...(next === "REJECTED" ? { rejectionReason: d.note ?? null } : {}),
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
  });

  revalidatePath("/submissions");
  revalidatePath(`/submissions/${d.id}`);
  revalidatePath(`/jobs/${submission.jobId}`);
  revalidatePath(`/candidates/${submission.candidateId}`);
}
