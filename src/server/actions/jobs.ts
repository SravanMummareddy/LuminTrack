"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { jobSchema, JOB_STATUS_VALUES } from "@/lib/validation/job";
import { toFieldErrors } from "@/lib/validation/common";
import { JOB_STATUS_LABEL, OTHER_SOURCE } from "@/lib/labels";
import type { FormState } from "@/lib/form-state";

function readJob(formData: FormData) {
  return jobSchema.safeParse({
    title: formData.get("title") ?? "",
    clientId: formData.get("clientId") ?? "",
    vendorId: formData.get("vendorId") ?? "",
    sisterCompanySourceId: formData.get("sisterCompanySourceId") ?? "",
    sourceOther: formData.get("sourceOther") ?? "",
    status: formData.get("status") ?? "OPEN",
    location: formData.get("location") ?? "",
    vendorRate: formData.get("vendorRate") ?? "",
    candidateRate: formData.get("candidateRate") ?? "",
    description: formData.get("description") ?? "",
    notes: formData.get("notes") ?? "",
    recruiterIds: formData.getAll("recruiterIds").map(String),
    positions: formData.get("positions") ?? "",
    reqType: formData.get("reqType") ?? "",
    department: formData.get("department") ?? "",
    durationLabel: formData.get("durationLabel") ?? "",
    atsId: formData.get("atsId") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
  });
}

export async function createJob(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readJob(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;
  const isOtherSource = d.sisterCompanySourceId === OTHER_SOURCE;

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        title: d.title,
        clientId: d.clientId,
        vendorId: d.vendorId,
        sisterCompanySourceId: isOtherSource ? null : d.sisterCompanySourceId,
        sourceOther: isOtherSource ? (d.sourceOther ?? null) : null,
        status: d.status,
        location: d.location ?? null,
        vendorRate: d.vendorRate ?? null,
        candidateRate: d.candidateRate ?? null,
        description: d.description ?? null,
        notes: d.notes ?? null,
        positions: d.positions ?? null,
        reqType: d.reqType ?? null,
        department: d.department ?? null,
        durationLabel: d.durationLabel ?? null,
        atsId: d.atsId ?? null,
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
        createdById: user.id,
        assignments: {
          create: d.recruiterIds.map((recruiterId) => ({
            recruiterId,
            assignedById: user.id,
          })),
        },
      },
    });
    await logActivity(tx, {
      entityType: "JOB",
      action: "JOB_CREATED",
      description: `Job "${created.title}" created`,
      performedById: user.id,
      jobId: created.id,
    });
    return created;
  });

  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export async function updateJob(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const jobId = String(formData.get("id") ?? "").trim();
  if (!jobId) return { error: "Missing job reference." };

  const parsed = readJob(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;
  const isOtherSource = d.sisterCompanySourceId === OTHER_SOURCE;
  const nextSourceId = isOtherSource ? null : d.sisterCompanySourceId;
  const nextSourceOther = isOtherSource ? (d.sourceOther ?? null) : null;

  const existing = await prisma.job.findUnique({
    where: { id: jobId },
    include: { assignments: true },
  });
  if (!existing) return { error: "This job no longer exists." };

  // Record which scalar fields actually changed, for a meaningful audit entry.
  const changed: string[] = [];
  const compare = (label: string, before: unknown, after: unknown) => {
    if (String(before ?? "") !== String(after ?? "")) changed.push(label);
  };
  compare("title", existing.title, d.title);
  compare("client", existing.clientId, d.clientId);
  compare("vendor", existing.vendorId, d.vendorId);
  compare(
    "source",
    existing.sisterCompanySourceId ?? existing.sourceOther,
    nextSourceId ?? nextSourceOther,
  );
  compare("status", existing.status, d.status);
  compare("location", existing.location, d.location);
  compare("vendor rate", existing.vendorRate?.toString(), d.vendorRate);
  compare("candidate rate", existing.candidateRate?.toString(), d.candidateRate);
  compare("description", existing.description, d.description);
  compare("notes", existing.notes, d.notes);
  compare("positions", existing.positions, d.positions);
  compare("position type", existing.reqType, d.reqType);
  compare("department", existing.department, d.department);
  compare("duration", existing.durationLabel, d.durationLabel);
  compare("customer ref", existing.atsId, d.atsId);
  compare(
    "projected start",
    existing.startDate?.toISOString(),
    d.startDate?.toISOString(),
  );
  compare(
    "projected end",
    existing.endDate?.toISOString(),
    d.endDate?.toISOString(),
  );

  const currentRecruiters = new Set(existing.assignments.map((a) => a.recruiterId));
  const desiredRecruiters = new Set(d.recruiterIds);
  const toAdd = d.recruiterIds.filter((id) => !currentRecruiters.has(id));
  const toRemove = [...currentRecruiters].filter((id) => !desiredRecruiters.has(id));

  const affected = [...new Set([...toAdd, ...toRemove])];
  const affectedUsers = affected.length
    ? await prisma.user.findMany({
        where: { id: { in: affected } },
        select: { id: true, fullName: true },
      })
    : [];
  const recruiterNames = new Map(
    affectedUsers.map((u) => [u.id, u.fullName] as const),
  );

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: {
        title: d.title,
        clientId: d.clientId,
        vendorId: d.vendorId,
        sisterCompanySourceId: nextSourceId,
        sourceOther: nextSourceOther,
        status: d.status,
        location: d.location ?? null,
        vendorRate: d.vendorRate ?? null,
        candidateRate: d.candidateRate ?? null,
        description: d.description ?? null,
        notes: d.notes ?? null,
        positions: d.positions ?? null,
        reqType: d.reqType ?? null,
        department: d.department ?? null,
        durationLabel: d.durationLabel ?? null,
        atsId: d.atsId ?? null,
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
      },
    });

    if (toRemove.length)
      await tx.jobAssignment.deleteMany({
        where: { jobId, recruiterId: { in: toRemove } },
      });
    for (const recruiterId of toAdd)
      await tx.jobAssignment.create({
        data: { jobId, recruiterId, assignedById: user.id },
      });

    if (changed.length)
      await logActivity(tx, {
        entityType: "JOB",
        action: "JOB_UPDATED",
        description: `Job details updated (${changed.join(", ")})`,
        newValue: changed.join(", "),
        performedById: user.id,
        jobId,
      });
    for (const recruiterId of toAdd)
      await logActivity(tx, {
        entityType: "JOB",
        action: "RECRUITER_ASSIGNED",
        description: `${recruiterNames.get(recruiterId) ?? "A recruiter"} assigned to the job`,
        performedById: user.id,
        jobId,
      });
    for (const recruiterId of toRemove)
      await logActivity(tx, {
        entityType: "JOB",
        action: "RECRUITER_UNASSIGNED",
        description: `${recruiterNames.get(recruiterId) ?? "A recruiter"} removed from the job`,
        performedById: user.id,
        jobId,
      });
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

/** Quick status change from the job detail page (covers spec §9.2 "Close job"). */
export async function changeJobStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const jobId = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!jobId) return;
  if (!(JOB_STATUS_VALUES as readonly string[]).includes(status)) return;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status === status) return;
  const next = status as (typeof JOB_STATUS_VALUES)[number];

  await prisma.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: next } });
    await logActivity(tx, {
      entityType: "JOB",
      action: "JOB_UPDATED",
      description: `Status changed from ${JOB_STATUS_LABEL[job.status]} to ${JOB_STATUS_LABEL[next]}`,
      oldValue: JOB_STATUS_LABEL[job.status],
      newValue: JOB_STATUS_LABEL[next],
      performedById: user.id,
      jobId,
    });
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
}
