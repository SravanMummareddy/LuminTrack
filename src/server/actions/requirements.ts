"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canManageRequirements, hasFullAccess } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { deriveTeamLead } from "@/server/team-lead";
import {
  createSubmissionRecord,
  type CreateSubmissionResult,
} from "@/server/submission-create";
import {
  requirementSchema,
  requirementEditSchema,
} from "@/lib/validation/requirement";
import { submissionSchema } from "@/lib/validation/submission";
import { toFieldErrors } from "@/lib/validation/common";
import { JOB_STATUS_LABEL, CANDIDATE_STATUS_LABEL } from "@/lib/labels";
import type { FormState } from "@/lib/form-state";

function readRequirement(formData: FormData) {
  return {
    candidateId: formData.get("candidateId") ?? "",
    recruiterId: formData.get("recruiterId") ?? "",
    location: formData.get("location") ?? "",
    payRate: formData.get("payRate") ?? "",
    billRate: formData.get("billRate") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
    teamLead: formData.get("teamLead") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
  };
}

export async function createVendorRequirement(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!canManageRequirements(user))
    return { error: "Only admins and team leads can create requirements." };

  const parsed = requirementSchema.safeParse({
    jobId: formData.get("jobId") ?? "",
    ...readRequirement(formData),
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const job = await prisma.job.findUnique({
    where: { id: d.jobId },
    select: { id: true, title: true, location: true },
  });
  if (!job)
    return {
      error: "That job no longer exists.",
      fieldErrors: { jobId: "Select a job." },
    };

  // teamLead = explicit value, else derived from the recruiter's team lead.
  const teamLead = d.teamLead ?? (await deriveTeamLead(d.recruiterId ?? null));

  const created = await prisma.$transaction(async (tx) => {
    const r = await tx.vendorRequirement.create({
      data: {
        jobId: d.jobId,
        candidateId: d.candidateId ?? null,
        recruiterId: d.recruiterId ?? null,
        location: d.location ?? job.location ?? null,
        payRate: d.payRate ?? null,
        billRate: d.billRate ?? null,
        clientRate: d.clientRate ?? null,
        engagement: d.engagement ?? null,
        vendorRecruiterName: d.vendorRecruiterName ?? null,
        jobDuties: d.jobDuties ?? null,
        teamLead: teamLead ?? null,
        submissionNotes: d.submissionNotes ?? null,
        createdById: user.id,
      },
    });
    await logActivity(tx, {
      entityType: "REQUIREMENT",
      action: "REQUIREMENT_CREATED",
      description: `Vendor requirement created for "${job.title}"`,
      performedById: user.id,
      requirementId: r.id,
    });
    return r;
  });

  revalidatePath("/vendor-portal");
  revalidatePath(`/jobs/${d.jobId}`);
  redirect(`/vendor-portal/${created.id}`);
}

export async function updateVendorRequirement(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!canManageRequirements(user))
    return { error: "Only admins and team leads can edit requirements." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing requirement reference." };

  const existing = await prisma.vendorRequirement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) return { error: "This requirement no longer exists." };
  if (existing.status !== "OPEN")
    return {
      error:
        "This requirement has been converted or cancelled and can no longer be edited.",
    };

  const parsed = requirementEditSchema.safeParse(readRequirement(formData));
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const teamLead = d.teamLead ?? (await deriveTeamLead(d.recruiterId ?? null));

  await prisma.$transaction(async (tx) => {
    await tx.vendorRequirement.update({
      where: { id },
      data: {
        candidateId: d.candidateId ?? null,
        recruiterId: d.recruiterId ?? null,
        location: d.location ?? null,
        payRate: d.payRate ?? null,
        billRate: d.billRate ?? null,
        clientRate: d.clientRate ?? null,
        engagement: d.engagement ?? null,
        vendorRecruiterName: d.vendorRecruiterName ?? null,
        jobDuties: d.jobDuties ?? null,
        teamLead: teamLead ?? null,
        submissionNotes: d.submissionNotes ?? null,
      },
    });
    await logActivity(tx, {
      entityType: "REQUIREMENT",
      action: "REQUIREMENT_UPDATED",
      description: "Vendor requirement updated",
      performedById: user.id,
      requirementId: id,
    });
  });

  revalidatePath("/vendor-portal");
  revalidatePath(`/vendor-portal/${id}`);
  redirect(`/vendor-portal/${id}`);
}

/** Cancels an OPEN requirement (soft — sets CANCELLED). Converted requirements
 *  are read-only and cannot be cancelled (their submission lives on). */
export async function cancelVendorRequirement(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canManageRequirements(user)) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const existing = await prisma.vendorRequirement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing || existing.status !== "OPEN") {
    redirect(`/vendor-portal/${id}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.vendorRequirement.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await logActivity(tx, {
      entityType: "REQUIREMENT",
      action: "REQUIREMENT_CANCELLED",
      description: "Vendor requirement cancelled",
      performedById: user.id,
      requirementId: id,
    });
  });

  revalidatePath("/vendor-portal");
  redirect("/vendor-portal");
}

/** Closes an OPEN requirement once it's been fulfilled — the submissions made
 *  against it live on. Uses the (repurposed) CONVERTED status = "Closed". */
export async function closeVendorRequirement(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canManageRequirements(user)) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const existing = await prisma.vendorRequirement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing || existing.status !== "OPEN") {
    redirect(`/vendor-portal/${id}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.vendorRequirement.update({
      where: { id },
      data: { status: "CONVERTED", convertedAt: new Date(), convertedById: user.id },
    });
    await logActivity(tx, {
      entityType: "REQUIREMENT",
      action: "REQUIREMENT_CONVERTED",
      description: "Vendor requirement closed",
      performedById: user.id,
      requirementId: id,
    });
  });

  revalidatePath("/vendor-portal");
  redirect(`/vendor-portal/${id}`);
}

/** Aborts the submit transaction when a shared submission gate fires (duplicate
 *  / iLabor closed / cap) so nothing partial is written. Caught by the action
 *  and surfaced as a `needsConfirm` prompt. */
class SubmitGate extends Error {
  constructor(public result: CreateSubmissionResult) {
    super("submit-gate");
  }
}

export async function convertRequirementToSubmission(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const requirementId = String(formData.get("requirementId") ?? "").trim();
  if (!requirementId) return { error: "Missing requirement reference." };

  // The convert form IS the submission form (prefilled + editable) — parse it
  // with the submission schema (candidate becomes required here).
  const parsed = submissionSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    jobId: formData.get("jobId") ?? "",
    submittedById: formData.get("submittedById") ?? "",
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
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const convertOverrideReason = String(
    formData.get("convertOverrideReason") ?? "",
  ).trim();
  const duplicateReason = String(formData.get("duplicateReason") ?? "").trim();
  const ilaborOverrideReason = String(
    formData.get("ilaborOverrideReason") ?? "",
  ).trim();
  const candidateStatusOverrideReason = String(
    formData.get("candidateStatusOverrideReason") ?? "",
  ).trim();

  const requirement = await prisma.vendorRequirement.findUnique({
    where: { id: requirementId },
    select: { id: true, status: true },
  });
  if (!requirement) return { error: "This requirement no longer exists." };
  if (requirement.status !== "OPEN")
    return { error: "This requirement is closed or cancelled and no longer accepts submissions." };

  const [job, candidate] = await Promise.all([
    prisma.job.findUnique({
      where: { id: d.jobId },
      select: {
        id: true,
        title: true,
        status: true,
        submitLimit: true,
        ilaborSubmitOpen: true,
        externalActiveCount: true,
      },
    }),
    prisma.candidate.findUnique({
      where: { id: d.candidateId },
      select: {
        id: true,
        fullName: true,
        status: true,
        isActive: true,
        placements: {
          where: { status: { in: ["ACTIVE", "EXTENDED"] } },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);
  if (!job) return { error: "This job no longer exists." };
  if (!candidate)
    return {
      error: "That candidate no longer exists.",
      fieldErrors: { candidateId: "Select a candidate." },
    };

  // ── Block gates (not overridable) ──
  if (
    job.status === "CLOSED" ||
    job.status === "FILLED" ||
    job.status === "CANCELLED"
  )
    return {
      error: `"${job.title}" is ${JOB_STATUS_LABEL[job.status]} and no longer accepting submissions.`,
    };
  if (!candidate.isActive)
    return {
      error: `${candidate.fullName} has been archived — restore the candidate before converting.`,
    };

  // Candidate-status soft block (warn + override) — parallels the direct-submit
  // path. A Not-interested / Do-not-contact candidate can still be submitted
  // with an explicit reason (captured on the audit trail).
  const candidateBlocked =
    candidate.status === "NOT_INTERESTED" ||
    candidate.status === "DO_NOT_CONTACT";
  if (candidateBlocked && !candidateStatusOverrideReason)
    return {
      needsConfirm: "candidate_status",
      error: `${candidate.fullName} is marked "${CANDIDATE_STATUS_LABEL[candidate.status]}". Add a reason to submit anyway.`,
    };

  // Resolve a picked résumé up front (also drives the archived-résumé warn).
  let pickedResume: {
    id: string;
    blobUrl: string | null;
  } | null = null;
  let pickedResumeArchived = false;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: {
        id: true,
        blobUrl: true,
        candidateId: true,
        isActive: true,
      },
    });
    if (!resume || resume.candidateId !== d.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, blobUrl: resume.blobUrl };
    pickedResumeArchived = !resume.isActive;
  }

  // ── Warn gates (a single convertOverrideReason clears all of them) ──
  if (!convertOverrideReason) {
    if (candidate.status === "PLACED" && candidate.placements.length > 0)
      return {
        needsConfirm: "candidate_placed",
        error: `${candidate.fullName} is currently on an active placement. Convert anyway?`,
      };
    if (pickedResumeArchived)
      return {
        needsConfirm: "archived_resume",
        error: "The selected résumé has been archived. Convert anyway?",
      };
    const pay = d.payRate ?? 0;
    const bill = d.billRate ?? 0;
    if (pay === 0 && bill === 0)
      return {
        needsConfirm: "zero_rates",
        error: "Pay and bill rates are both blank/0 — convert with rates pending?",
      };
    if (d.payRate != null && d.billRate != null && d.billRate < d.payRate)
      return {
        needsConfirm: "bill_below_pay",
        error: "Bill rate is below pay rate (negative margin). Convert anyway?",
      };
  }

  let createdId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const res = await createSubmissionRecord(tx, {
        candidateId: d.candidateId,
        jobId: d.jobId,
        submittedById: d.submittedById,
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
        candidateStatusOverrideReason,
        job,
        candidateFullName: candidate.fullName,
        actor: { id: user.id, fullName: user.fullName, isAdmin: hasFullAccess(user) },
      });
      // A shared gate fired — abort so nothing partial is written.
      if (res.kind !== "created") throw new SubmitGate(res);
      // Link the new submission back to the requirement. The VPR stays OPEN so
      // more candidates can be submitted against it (1:many).
      await tx.submission.update({
        where: { id: res.submissionId },
        data: { vendorRequirementId: requirementId },
      });
      await logActivity(tx, {
        entityType: "REQUIREMENT",
        action: "REQUIREMENT_CONVERTED",
        description: `${candidate.fullName} submitted against requirement for "${job.title}"`,
        performedById: user.id,
        requirementId,
      });
      createdId = res.submissionId;
    });
  } catch (e) {
    if (e instanceof SubmitGate) {
      const r = e.result;
      if (r.kind === "duplicate")
        return {
          needsConfirm: "duplicate",
          confirmData: { existingSubmissionId: r.existingId },
          error: `${candidate.fullName} was already submitted to this job. Pick a reason to submit again.`,
        };
      if (r.kind === "ilabor_closed")
        return {
          needsConfirm: "ilabor_closed",
          error:
            "iLabor has closed submissions on this requisition. Pick a reason to submit anyway.",
        };
      if (r.kind === "ilabor_cap")
        return {
          needsConfirm: "ilabor_cap",
          confirmData: { cap: r.cap, active: r.active },
          error: `iLabor's cap of ${r.cap} is reached (${r.active} active). Pick a reason to submit past the cap.`,
        };
    }
    throw e;
  }

  revalidatePath("/vendor-portal");
  revalidatePath(`/vendor-portal/${requirementId}`);
  revalidatePath("/submissions");
  revalidatePath(`/jobs/${d.jobId}`);
  revalidatePath(`/candidates/${d.candidateId}`);
  redirect(`/submissions/${createdId}`);
}
