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
    resumeDriveLink: formData.get("resumeDriveLink") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
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
      select: { id: true, fullName: true, resumeDriveLink: true },
    }),
  ]);
  if (!job) return { error: "This job no longer exists." };
  if (!candidate)
    return {
      error: "That candidate no longer exists.",
      fieldErrors: { candidateId: "Select a candidate." },
    };

  let submissionId: string;
  try {
    submissionId = await prisma.$transaction(async (tx) => {
      const created = await tx.submission.create({
        data: {
          candidateId: d.candidateId,
          jobId: d.jobId,
          submittedById: d.submittedById,
          candidateRate: d.candidateRate ?? null,
          // Fall back to the candidate's resume on file when none is given.
          resumeDriveLink: d.resumeDriveLink ?? candidate.resumeDriveLink ?? null,
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
