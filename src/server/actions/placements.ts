"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import {
  placementUpdateSchema,
  placementExtendSchema,
  placementEndSchema,
} from "@/lib/validation/placement";
import { toFieldErrors } from "@/lib/validation/common";
import { endOfPlacementCascade } from "@/server/placement-lifecycle";
import type { FormState } from "@/lib/form-state";

const END_REASON_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  TERMINATED_BY_CLIENT: "Terminated by client",
  RESIGNED: "Resigned",
  PERFORMANCE: "Performance",
  OTHER: "Other",
};

// R4.2 — rate-edit permission. Admins always pass; otherwise the user must be
// the submission's recruiter-of-record. Non-eligible users may still edit
// non-rate fields (manager, PO #, etc.).
function canEditRates(args: {
  userRole: string;
  userId: string;
  submittedById: string;
}): boolean {
  return args.userRole === "ADMIN" || args.userId === args.submittedById;
}

function fmtRate(value: unknown): string {
  if (value === null || value === undefined) return "$0";
  return `$${Number(value).toFixed(2)}`;
}

export async function updatePlacement(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = placementUpdateSchema.safeParse({
    id: formData.get("id") ?? "",
    billRate: formData.get("billRate") ?? "",
    payRate: formData.get("payRate") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    clientPoNumber: formData.get("clientPoNumber") ?? "",
    invoiceRef: formData.get("invoiceRef") ?? "",
    onsiteManagerName: formData.get("onsiteManagerName") ?? "",
    onsiteManagerEmail: formData.get("onsiteManagerEmail") ?? "",
    organisation: formData.get("organisation") ?? "",
    teamLead: formData.get("teamLead") ?? "",
    interviewDate: formData.get("interviewDate") ?? "",
    placementDate: formData.get("placementDate") ?? "",
    remarks: formData.get("remarks") ?? "",
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.placement.findUnique({
    where: { id: d.id },
    include: {
      submission: { select: { submittedById: true } },
      candidate: { select: { fullName: true } },
    },
  });
  if (!existing) return { error: "This placement no longer exists." };

  const mayEditRates = canEditRates({
    userRole: user.role,
    userId: user.id,
    submittedById: existing.submission.submittedById,
  });

  // Build a diff string for the audit description — recruiters see meaningful
  // entries on the timeline instead of generic "updated."
  const changed: string[] = [];
  const compare = (label: string, before: unknown, after: unknown) => {
    if (String(before ?? "") !== String(after ?? "")) changed.push(label);
  };

  // Apply rate fields only when the caller is allowed to set them AND when the
  // form actually carried a value. Empty submits leave rates untouched.
  const data: Record<string, unknown> = {
    startDate: d.startDate,
    endDate: d.endDate ?? null,
    clientPoNumber: d.clientPoNumber ?? null,
    invoiceRef: d.invoiceRef ?? null,
    onsiteManagerName: d.onsiteManagerName ?? null,
    onsiteManagerEmail: d.onsiteManagerEmail ?? null,
    organisation: d.organisation ?? null,
    teamLead: d.teamLead ?? null,
    interviewDate: d.interviewDate ?? null,
    placementDate: d.placementDate ?? null,
    remarks: d.remarks ?? null,
  };
  if (mayEditRates) {
    if (d.billRate !== undefined) {
      compare(
        `bill rate ${fmtRate(existing.billRate)} → ${fmtRate(d.billRate)}`,
        existing.billRate.toString(),
        d.billRate.toString(),
      );
      data.billRate = d.billRate;
    }
    if (d.payRate !== undefined) {
      compare(
        `pay rate ${fmtRate(existing.payRate)} → ${fmtRate(d.payRate)}`,
        existing.payRate.toString(),
        d.payRate.toString(),
      );
      data.payRate = d.payRate;
    }
    if (d.clientRate !== undefined) {
      compare(
        `client rate ${fmtRate(existing.clientRate ?? null)} → ${fmtRate(d.clientRate)}`,
        existing.clientRate?.toString() ?? "",
        d.clientRate.toString(),
      );
      data.clientRate = d.clientRate;
    }
  }

  compare("start date", existing.startDate.toISOString().slice(0, 10), d.startDate.toISOString().slice(0, 10));
  compare(
    "end date",
    existing.endDate?.toISOString().slice(0, 10) ?? "",
    d.endDate?.toISOString().slice(0, 10) ?? "",
  );
  compare("client PO #", existing.clientPoNumber, d.clientPoNumber);
  compare("invoice ref", existing.invoiceRef, d.invoiceRef);
  compare("onsite manager", existing.onsiteManagerName, d.onsiteManagerName);
  compare("onsite email", existing.onsiteManagerEmail, d.onsiteManagerEmail);
  compare("organisation", existing.organisation, d.organisation);
  compare("lead", existing.teamLead, d.teamLead);
  compare(
    "interview date",
    existing.interviewDate?.toISOString().slice(0, 10) ?? "",
    d.interviewDate?.toISOString().slice(0, 10) ?? "",
  );
  compare(
    "placement date",
    existing.placementDate?.toISOString().slice(0, 10) ?? "",
    d.placementDate?.toISOString().slice(0, 10) ?? "",
  );
  compare("remarks", existing.remarks, d.remarks);

  if (!changed.length) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.placement.update({ where: { id: d.id }, data });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "PLACEMENT_UPDATED",
      description: `${existing.candidate.fullName}: placement updated (${changed.join(", ")})`,
      newValue: changed.join(", "),
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/placements/${d.id}`);
  revalidatePath("/placements");
  return { ok: true };
}

export async function extendPlacement(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = placementExtendSchema.safeParse({
    id: formData.get("id") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    newBillRate: formData.get("newBillRate") ?? "",
    newPayRate: formData.get("newPayRate") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.placement.findUnique({
    where: { id: d.id },
    include: {
      submission: { select: { submittedById: true } },
      candidate: { select: { fullName: true } },
      extensions: {
        orderBy: { endDate: "desc" },
        take: 1,
        select: { endDate: true },
      },
    },
  });
  if (!existing) return { error: "This placement no longer exists." };
  if (existing.status === "ENDED" || existing.status === "TERMINATED")
    return { error: "This placement has already ended — can't extend." };

  // No overlap with the current term or prior extensions. The action also
  // enforces this so the UI can't sneak through invalid extensions even with
  // a manipulated form post.
  const lastEnd = existing.extensions[0]?.endDate ?? existing.endDate ?? existing.startDate;
  if (d.startDate < lastEnd) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: {
        startDate: `Extension must start on or after ${lastEnd.toISOString().slice(0, 10)}.`,
      },
    };
  }

  const mayEditRates = canEditRates({
    userRole: user.role,
    userId: user.id,
    submittedById: existing.submission.submittedById,
  });

  await prisma.$transaction(async (tx) => {
    await tx.placementExtension.create({
      data: {
        placementId: d.id,
        startDate: d.startDate,
        endDate: d.endDate,
        note: d.note ?? null,
      },
    });
    await tx.placement.update({
      where: { id: d.id },
      data: {
        endDate: d.endDate,
        status: "EXTENDED",
        // Optional new rates carry across the extension; honored only when the
        // caller has rate-edit permission.
        ...(mayEditRates && d.newBillRate !== undefined
          ? { billRate: d.newBillRate }
          : {}),
        ...(mayEditRates && d.newPayRate !== undefined
          ? { payRate: d.newPayRate }
          : {}),
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "PLACEMENT_EXTENDED",
      description: `${existing.candidate.fullName}: placement extended through ${d.endDate.toISOString().slice(0, 10)}`,
      newValue: d.endDate.toISOString().slice(0, 10),
      note: d.note ?? null,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/placements/${d.id}`);
  revalidatePath("/placements");
  return { ok: true };
}

export async function endPlacement(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = placementEndSchema.safeParse({
    id: formData.get("id") ?? "",
    endReason: formData.get("endReason") ?? "",
    endNote: formData.get("endNote") ?? "",
    endDate: formData.get("endDate") ?? "",
    replacementSubmissionId: formData.get("replacementSubmissionId") ?? "",
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.placement.findUnique({
    where: { id: d.id },
    include: {
      candidate: { select: { id: true, fullName: true, status: true } },
    },
  });
  if (!existing) return { error: "This placement no longer exists." };

  // Replacement submission must exist and target the same job as this placement.
  if (d.replacementSubmissionId) {
    const replacement = await prisma.submission.findUnique({
      where: { id: d.replacementSubmissionId },
      select: { id: true, jobId: true, replacementFor: { select: { id: true } } },
    });
    if (!replacement || replacement.jobId !== existing.jobId) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          replacementSubmissionId: "Pick a submission for the same job.",
        },
      };
    }
    if (replacement.replacementFor && replacement.replacementFor.id !== existing.id) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          replacementSubmissionId: "That submission is already the replacement for another placement.",
        },
      };
    }
  }

  // ENDED = clean completion; TERMINATED = early/forced end. The reason picks
  // the bucket — only `COMPLETED` maps to ENDED, the rest are TERMINATED.
  const nextStatus = d.endReason === "COMPLETED" ? "ENDED" : "TERMINATED";

  await prisma.$transaction(async (tx) => {
    await tx.placement.update({
      where: { id: d.id },
      data: {
        status: nextStatus,
        endReason: d.endReason,
        endNote: d.endNote ?? null,
        endDate: d.endDate,
        replacementSubmissionId: d.replacementSubmissionId ?? null,
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "PLACEMENT_ENDED",
      description: `${existing.candidate.fullName}: placement ended (${END_REASON_LABEL[d.endReason]})`,
      newValue: nextStatus,
      note: d.endNote ?? null,
      reason: END_REASON_LABEL[d.endReason],
      performedById: user.id,
      candidateId: existing.candidateId,
    });
    await endOfPlacementCascade(tx, {
      candidateId: existing.candidateId,
      candidateFullName: existing.candidate.fullName,
      candidateStatus: existing.candidate.status,
      performedById: user.id,
    });
  });

  revalidatePath(`/placements/${d.id}`);
  revalidatePath("/placements");
  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}
