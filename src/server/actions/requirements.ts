"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canManageRequirements } from "@/lib/permissions";
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
    candidateRate: formData.get("candidateRate") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
    teamLead: formData.get("teamLead") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
    resumeDriveLink: formData.get("resumeDriveLink") ?? "",
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
        candidateRate: d.candidateRate ?? null,
        engagement: d.engagement ?? null,
        vendorRecruiterName: d.vendorRecruiterName ?? null,
        jobDuties: d.jobDuties ?? null,
        teamLead: teamLead ?? null,
        submissionNotes: d.submissionNotes ?? null,
        resumeDriveLink: d.resumeDriveLink ?? null,
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
        candidateRate: d.candidateRate ?? null,
        engagement: d.engagement ?? null,
        vendorRecruiterName: d.vendorRecruiterName ?? null,
        jobDuties: d.jobDuties ?? null,
        teamLead: teamLead ?? null,
        submissionNotes: d.submissionNotes ?? null,
        resumeDriveLink: d.resumeDriveLink ?? null,
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

/** Rolls back the requirement claim when a shared submission gate fires inside
 *  the convert transaction (so we never leave a CONVERTED requirement without a
 *  submission). Caught by the action and surfaced as a `needsConfirm` prompt. */
class ConvertGate extends Error {
  constructor(public result: CreateSubmissionResult) {
    super("convert-gate");
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
    candidateRate: formData.get("candidateRate") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
    resumeChoice: formData.get("resumeChoice") ?? "none",
    candidateResumeId: formData.get("candidateResumeId") ?? "",
    newResumeLabel: formData.get("newResumeLabel") ?? "",
    newResumeLink: formData.get("newResumeLink") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
    payRate: formData.get("payRate") ?? "",
    billRate: formData.get("billRate") ?? "",
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

  const requirement = await prisma.vendorRequirement.findUnique({
    where: { id: requirementId },
    select: { id: true, status: true },
  });
  if (!requirement) return { error: "This requirement no longer exists." };
  if (requirement.status !== "OPEN")
    return { error: "This requirement has already been converted or cancelled." };

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
  if (candidate.status === "NOT_INTERESTED" || candidate.status === "DO_NOT_CONTACT")
    return {
      error: `${candidate.fullName} is marked "${CANDIDATE_STATUS_LABEL[candidate.status]}" — cannot convert.`,
    };

  // Resolve a picked résumé up front (also drives the archived-résumé warn).
  let pickedResume: { id: string; driveLink: string } | null = null;
  let pickedResumeArchived = false;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: { id: true, driveLink: true, candidateId: true, isActive: true },
    });
    if (!resume || resume.candidateId !== d.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, driveLink: resume.driveLink };
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

  const newResume =
    !pickedResume && d.resumeChoice === "new" && d.newResumeLabel && d.newResumeLink
      ? { label: d.newResumeLabel, link: d.newResumeLink }
      : null;

  let createdId: string | null = null;
  let alreadyConverted = false;
  try {
    await prisma.$transaction(async (tx) => {
      // Idempotent claim — only the converter that flips OPEN→CONVERTED proceeds,
      // so a double-submit / race can't create two submissions.
      const claim = await tx.vendorRequirement.updateMany({
        where: { id: requirementId, status: "OPEN" },
        data: {
          status: "CONVERTED",
          convertedAt: new Date(),
          convertedById: user.id,
        },
      });
      if (claim.count === 0) {
        alreadyConverted = true;
        return;
      }
      const res = await createSubmissionRecord(tx, {
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
        teamLead: d.teamLead ?? null,
        pickedResume,
        newResume,
        duplicateReason,
        ilaborOverrideReason,
        job,
        candidateFullName: candidate.fullName,
        actor: { id: user.id, fullName: user.fullName, isAdmin: user.role === "ADMIN" },
      });
      // A shared gate fired — roll back the claim so the requirement stays OPEN.
      if (res.kind !== "created") throw new ConvertGate(res);
      await tx.vendorRequirement.update({
        where: { id: requirementId },
        data: { convertedSubmissionId: res.submissionId },
      });
      await logActivity(tx, {
        entityType: "REQUIREMENT",
        action: "REQUIREMENT_CONVERTED",
        description: `${candidate.fullName} → submission for "${job.title}"`,
        performedById: user.id,
        requirementId,
      });
      createdId = res.submissionId;
    });
  } catch (e) {
    if (e instanceof ConvertGate) {
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
  if (alreadyConverted)
    return { error: "This requirement was just converted by someone else." };

  revalidatePath("/vendor-portal");
  revalidatePath(`/vendor-portal/${requirementId}`);
  revalidatePath("/submissions");
  revalidatePath(`/jobs/${d.jobId}`);
  revalidatePath(`/candidates/${d.candidateId}`);
  redirect(`/submissions/${createdId}`);
}
