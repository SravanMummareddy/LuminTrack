"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { canManageRequirements, hasFullAccess } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { deriveTeamLead } from "@/server/team-lead";
import {
  createSubmissionRecord,
  type CreateSubmissionResult,
} from "@/server/submission-create";
import {
  collectSubmissionGates,
  gatesFromCreateResult,
  workAuthExpiredOn,
} from "@/server/submission-gates";
import { formatDate } from "@/lib/format";
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
    recruiterIdNa: formData.get("recruiterId__na") ?? "",
    location: formData.get("location") ?? "",
    payRate: formData.get("payRate") ?? "",
    payRateNa: formData.get("payRate__na") ?? "",
    billRate: formData.get("billRate") ?? "",
    billRateNa: formData.get("billRate__na") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    clientRateNa: formData.get("clientRate__na") ?? "",
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
  const db = await getScopedPrisma();
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

  const job = await db.job.findUnique({
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

  const created = await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!canManageRequirements(user))
    return { error: "Only admins and team leads can edit requirements." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing requirement reference." };

  const existing = await db.vendorRequirement.findUnique({
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

  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!canManageRequirements(user)) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const existing = await db.vendorRequirement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing || existing.status !== "OPEN") {
    redirect(`/vendor-portal/${id}`);
  }

  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!canManageRequirements(user)) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const existing = await db.vendorRequirement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing || existing.status !== "OPEN") {
    redirect(`/vendor-portal/${id}`);
  }

  await db.$transaction(async (tx) => {
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
  // Also refresh THIS requirement's detail page — otherwise its Router Cache
  // keeps the stale "OPEN" render (incl. the "Submit a candidate" button), and
  // clicking it soft-navigates to the convert page which redirects straight
  // back, reading as a dead button until a hard reload. (Matches updateVendorRequirement.)
  revalidatePath(`/vendor-portal/${id}`);
  redirect(`/vendor-portal/${id}`);
}

/**
 * Permanently delete a requirement — allowed ONLY when it has zero submissions
 * (a mistaken/empty planning row, nothing to lose). Once a VPR has submissions we
 * refuse and the caller should Cancel instead, so the submission→requirement
 * provenance is never orphaned. The VPR's own audit rows cascade away with it
 * (Activity.requirementId is onDelete:Cascade), so we log REQUIREMENT_DELETED on
 * the parent JOB — that trail survives.
 */
export async function deleteVendorRequirement(formData: FormData): Promise<void> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!canManageRequirements(user)) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const existing = await db.vendorRequirement.findUnique({
    where: { id },
    select: { id: true, seq: true, jobId: true, _count: { select: { submissions: true } } },
  });
  // Guard: no VPR, or it has submissions → not deletable (Cancel instead).
  if (!existing || existing._count.submissions > 0) {
    redirect(`/vendor-portal/${id}`);
  }

  await db.$transaction(async (tx) => {
    // Delete first — this cascades the VPR's own Activity rows. Then log on the
    // job so the audit entry isn't swept away with them.
    await tx.vendorRequirement.delete({ where: { id } });
    await logActivity(tx, {
      entityType: "JOB",
      action: "REQUIREMENT_DELETED",
      description: `Deleted empty requirement VPR-${String(existing.seq).padStart(3, "0")} (0 submissions)`,
      performedById: user.id,
      jobId: existing.jobId,
    });
  });

  revalidatePath("/vendor-portal");
  revalidatePath(`/jobs/${existing.jobId}`);
  redirect("/vendor-portal");
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
  const db = await getScopedPrisma();
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
  const candidateStatusOverrideReason = String(
    formData.get("candidateStatusOverrideReason") ?? "",
  ).trim();
  const workAuthOverrideReason = String(
    formData.get("workAuthOverrideReason") ?? "",
  ).trim();
  const originalResumeOverrideReason = String(
    formData.get("originalResumeOverrideReason") ?? "",
  ).trim();
  const benchOverrideReason = String(
    formData.get("benchOverrideReason") ?? "",
  ).trim();

  const requirement = await db.vendorRequirement.findUnique({
    where: { id: requirementId },
    select: { id: true, status: true },
  });
  if (!requirement) return { error: "This requirement no longer exists." };
  if (requirement.status !== "OPEN")
    return { error: "This requirement is closed or cancelled and no longer accepts submissions." };

  const [job, candidate] = await Promise.all([
    db.job.findUnique({
      where: { id: d.jobId },
      select: {
        id: true,
        title: true,
        status: true,
      },
    }),
    db.candidate.findUnique({
      where: { id: d.candidateId },
      select: {
        id: true,
        fullName: true,
        status: true,
        isActive: true,
        benchConsultant: { select: { marketingStatus: true } },
        documents: {
          where: { category: "WORK_AUTH" },
          select: { expiresAt: true },
        },
        resumes: {
          where: { isActive: true, kind: "ORIGINAL" },
          select: { id: true },
          take: 1,
        },
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

  // Resolve a picked résumé up front (also drives the archived-résumé warn).
  let pickedResume: {
    id: string;
    blobUrl: string | null;
  } | null = null;
  let pickedResumeArchived = false;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await db.candidateResume.findUnique({
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

  // ── Collect EVERY soft gate up front so the form shows them stacked ──
  const candidateBlocked =
    candidate.status === "NOT_INTERESTED" ||
    candidate.status === "DO_NOT_CONTACT";
  const workAuthExpiry = workAuthExpiredOn(candidate.documents, new Date());
  const missingOriginalResume = candidate.resumes.length === 0;
  const bench = candidate.benchConsultant;
  const notMarketed = !bench || bench.marketingStatus === "INACTIVE";

  // Convert-only warnings share a single `convertOverrideReason`.
  const pay = d.payRate ?? 0;
  const bill = d.billRate ?? 0;
  const convertWarnings: string[] = [];
  if (candidate.status === "PLACED" && candidate.placements.length > 0)
    convertWarnings.push(`${candidate.fullName} is on an active placement.`);
  if (pickedResumeArchived)
    convertWarnings.push("The selected résumé has been archived.");
  if (pay === 0 && bill === 0)
    convertWarnings.push("Pay and bill rates are both blank/0 (rates pending).");
  if (d.payRate != null && d.billRate != null && d.billRate < d.payRate)
    convertWarnings.push("Bill rate is below pay rate (negative margin).");

  // Pre-check duplicate (createSubmissionRecord re-checks under the lock).
  const existingDup = await db.submission.findFirst({
    where: { candidateId: d.candidateId, jobId: d.jobId },
    select: { id: true },
  });

  const gates = collectSubmissionGates({
    isConvert: true,
    assignmentOk: true,
    rateWarnings: [],
    candidateStatusLabel: candidateBlocked
      ? CANDIDATE_STATUS_LABEL[candidate.status]
      : null,
    workAuthExpiredOn: workAuthExpiry ? formatDate(workAuthExpiry) : null,
    missingOriginalResume,
    notMarketed,
    convertWarnings,
    duplicateExistingId: existingDup?.id ?? null,
    reasons: {
      rate: "",
      candidateStatus: candidateStatusOverrideReason,
      workAuth: workAuthOverrideReason,
      originalResume: originalResumeOverrideReason,
      bench: benchOverrideReason,
      convert: convertOverrideReason,
      duplicate: duplicateReason,
    },
  });
  if (gates.length > 0)
    return {
      pendingGates: gates,
      error: `Review ${gates.length} item${gates.length === 1 ? "" : "s"} below, then submit.`,
    };

  let createdId: string | null = null;
  try {
    await db.$transaction(async (tx) => {
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
        candidateStatusOverrideReason,
        workAuthOverrideReason,
        originalResumeOverrideReason,
        benchOverrideReason,
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
      // A duplicate slipped in under the advisory lock — surface it stacked.
      return {
        pendingGates: gatesFromCreateResult(e.result),
        error: "Resolve the item below, then submit.",
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
