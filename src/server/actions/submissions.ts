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
  SUBMISSION_STATUS_VALUES,
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

/** Manual submission status change from the submission detail page (spec §9.8). */
export async function changeSubmissionStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const submissionId = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();
  if (!submissionId) return;
  if (!(SUBMISSION_STATUS_VALUES as readonly string[]).includes(status)) return;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
    },
  });
  if (!submission || submission.status === status) return;
  const next = status as SubmissionStatus;

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
      where: { id: submissionId },
      data: {
        status: next,
        ...(next === "REJECTED"
          ? { rejectionReason: rejectionReason || null }
          : {}),
      },
    });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action,
      description: `${submission.candidate.fullName} on "${submission.job.title}": status changed from ${SUBMISSION_STATUS_LABEL[submission.status]} to ${SUBMISSION_STATUS_LABEL[next]}`,
      oldValue: SUBMISSION_STATUS_LABEL[submission.status],
      newValue: SUBMISSION_STATUS_LABEL[next],
      performedById: user.id,
      submissionId,
    });
  });

  revalidatePath("/submissions");
  revalidatePath(`/submissions/${submissionId}`);
  revalidatePath(`/jobs/${submission.jobId}`);
  revalidatePath(`/candidates/${submission.candidateId}`);
}
