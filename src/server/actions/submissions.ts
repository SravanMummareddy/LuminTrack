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
import { createSubmissionRecord } from "@/server/submission-create";

function readSubmission(formData: FormData) {
  return submissionSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    jobId: formData.get("jobId") ?? "",
    submittedById: formData.get("submittedById") ?? "",
    candidateRate: formData.get("candidateRate") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
    resumeChoice: formData.get("resumeChoice") ?? "none",
    candidateResumeId: formData.get("candidateResumeId") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
    payRate: formData.get("payRate") ?? "",
    billRate: formData.get("billRate") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    teamLead: formData.get("teamLead") ?? "",
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

  // Assignment gate (Round 5 — assignment workflow). Admins submit to any job
  // and may attribute the submission to anyone. A recruiter must be assigned to
  // the job first, but can self-claim it inline: the form re-submits with
  // claim=1, which assigns the job to them (logged) in the same tx as the
  // submission. Without the claim flag we pause and prompt.
  const claim = String(formData.get("claim") ?? "") === "1";
  const isAdmin = user.role === "ADMIN";
  if (!isAdmin) {
    const assignment = await prisma.jobAssignment.findFirst({
      where: { jobId: d.jobId, recruiterId: user.id },
      select: { id: true },
    });
    if (!assignment && !claim) {
      return {
        needsConfirm: "not_assigned",
        error: `You're not assigned to "${job.title}". Claim it to submit a candidate.`,
      };
    }
  }

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

  // Resolve a previously-saved résumé up front so a bad pick returns cleanly.
  let pickedResume: { id: string; blobUrl: string | null } | null = null;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: { id: true, blobUrl: true, candidateId: true },
    });
    if (!resume || resume.candidateId !== d.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, blobUrl: resume.blobUrl };
  }

  // One transaction, advisory-locked on the (candidate, job) pair. The actual
  // create + gates live in the shared createSubmissionRecord helper, which the
  // requirement→submission convert flow reuses. Overridable gates come back as
  // a tagged union so we can surface the right `needsConfirm` prompt.
  const result = await prisma.$transaction((tx) =>
    createSubmissionRecord(tx, {
      candidateId: d.candidateId,
      jobId: d.jobId,
      submittedById: d.submittedById,
      candidateRate: d.candidateRate ?? null,
      submissionNotes: d.submissionNotes ?? null,
      engagement: d.engagement ?? null,
      vendorRecruiterName: d.vendorRecruiterName ?? null,
      jobDuties: d.jobDuties ?? null,
      payRate: d.payRate ?? null,
      billRate: d.billRate ?? null,
      clientRate: d.clientRate ?? null,
      teamLead: d.teamLead ?? null,
      pickedResume,
      duplicateReason,
      ilaborOverrideReason,
      job,
      candidateFullName: candidate.fullName,
      actor: { id: user.id, fullName: user.fullName, isAdmin },
    }),
  );

  if (result.kind === "duplicate") {
    return {
      needsConfirm: "duplicate",
      confirmData: { existingSubmissionId: result.existingId },
      error: `${candidate.fullName} was already submitted to this job. Pick a reason to submit again.`,
    };
  }
  if (result.kind === "ilabor_closed") {
    return {
      needsConfirm: "ilabor_closed",
      error: `iLabor has closed submissions on this requisition. Pick a reason to submit anyway.`,
    };
  }
  if (result.kind === "ilabor_cap") {
    return {
      needsConfirm: "ilabor_cap",
      confirmData: { cap: result.cap, active: result.active },
      error: `iLabor's cap of ${result.cap} is reached (${result.active} active). Pick a reason to submit past the cap.`,
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
    submittedById: formData.get("submittedById") ?? "",
    resumeChoice: formData.get("resumeChoice") ?? "none",
    candidateResumeId: formData.get("candidateResumeId") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
    payRate: formData.get("payRate") ?? "",
    billRate: formData.get("billRate") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    teamLead: formData.get("teamLead") ?? "",
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
      submittedBy: { select: { fullName: true } },
    },
  });
  if (!existing) return { error: "This submission no longer exists." };

  // Admin-only re-attribution of "Submitted by". Recruiter scorecards key off
  // submittedById, so a mis-set submitter previously had no correction path.
  // Non-admins never reach this — the field is locked in their form.
  const isAdmin = user.role === "ADMIN";
  let newSubmittedById: string | null = null;
  let newSubmitterName = "";
  if (isAdmin && d.submittedById && d.submittedById !== existing.submittedById) {
    const target = await prisma.user.findUnique({
      where: { id: d.submittedById },
      select: { id: true, fullName: true },
    });
    if (!target)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { submittedById: "Pick a valid user." },
      };
    newSubmittedById = target.id;
    newSubmitterName = target.fullName;
  }

  // Resolve a previously-saved résumé up front so a bad pick returns cleanly.
  let pickedResume: { id: string; blobUrl: string | null } | null = null;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: { id: true, blobUrl: true, candidateId: true },
    });
    if (!resume || resume.candidateId !== existing.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, blobUrl: resume.blobUrl };
  }

  await prisma.$transaction(async (tx) => {
    // Settle the résumé: an existing library entry or none.
    const candidateResumeId = pickedResume?.id ?? null;
    const blobSnapshot = pickedResume?.blobUrl ?? null;

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
      String(existing.resumeBlobUrl ?? "") !== String(blobSnapshot ?? "")
    )
      changed.push("resume");
    if (newSubmittedById) changed.push("submitted by");

    await tx.submission.update({
      where: { id: submissionId },
      data: {
        candidateRate: d.candidateRate ?? null,
        submissionNotes: d.submissionNotes ?? null,
        submittedAt: d.submittedAt,
        candidateResumeId,
        // Snapshot the résumé's blob URL so it survives library edits/deletes.
        resumeBlobUrl: blobSnapshot,
        engagement: d.engagement ?? null,
        vendorRecruiterName: d.vendorRecruiterName ?? null,
        jobDuties: d.jobDuties ?? null,
        payRate: d.payRate ?? null,
        billRate: d.billRate ?? null,
        clientRate: d.clientRate ?? null,
        teamLead: d.teamLead ?? null,
        ...(newSubmittedById ? { submittedById: newSubmittedById } : {}),
      },
    });

    if (changed.length) {
      // Spell out the re-attribution (old → new) so the audit trail is
      // legible without cross-referencing — scorecards depend on it.
      const reattrNote = newSubmittedById
        ? `; submitted-by changed from ${existing.submittedBy.fullName} to ${newSubmitterName}`
        : "";
      await logActivity(tx, {
        entityType: "SUBMISSION",
        action: "SUBMISSION_UPDATED",
        description: `${existing.candidate.fullName} on "${existing.job.title}": submission updated (${changed.join(", ")})${reattrNote}`,
        newValue: changed.join(", "),
        performedById: user.id,
        submissionId,
      });
    }
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

  // Surfaced in the success toast — set when JOINED creates/reactivates a placement.
  let placementSeq: number | null = null;

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
      const placement = await ensurePlacementOnJoined(tx, {
        submissionId: d.id,
        candidateId: submission.candidateId,
        jobId: submission.jobId,
        candidateRate: submission.candidateRate,
        payRate: submission.payRate,
        billRate: submission.billRate,
        clientRate: submission.clientRate,
        candidateFullName: submission.candidate.fullName,
        jobTitle: submission.job.title,
        candidateStatus: submission.candidate.status,
        performedById: user.id,
        eventAt: d.actualJoinDate ?? d.eventAt ?? null,
      });
      placementSeq = placement.placementSeq;
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
  return {
    ok: true,
    celebrate: next === "JOINED",
    toast: {
      title: `Status updated to ${SUBMISSION_STATUS_LABEL[next]}`,
      description:
        placementSeq != null
          ? `Placement PLC-${String(placementSeq).padStart(3, "0")} created — set its rates next.`
          : undefined,
    },
  };
}
