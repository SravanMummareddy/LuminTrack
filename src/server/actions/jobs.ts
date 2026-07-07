"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  canManageOrgEntities,
  canEditJobRatesAndAssignment,
} from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { jobSchema, JOB_STATUS_VALUES } from "@/lib/validation/job";
import { toFieldErrors } from "@/lib/validation/common";
import { JOB_STATUS_LABEL, OTHER_SOURCE, NEW_ORG_ENTITY } from "@/lib/labels";
import type { FormState } from "@/lib/form-state";
import type { Prisma } from "@/generated/prisma/client";

/** Resolve a "+ Add new client/vendor" sentinel to an id: reuse a case-
 *  insensitive name match if one exists, else create the record. Mirrors the
 *  iLabor importer's create-if-missing so "Acme" and "ACME" don't fork. */
async function findOrCreateClient(tx: Prisma.TransactionClient, name: string) {
  const existing = await tx.client.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return existing ?? (await tx.client.create({ data: { name }, select: { id: true } }));
}
async function findOrCreateVendor(tx: Prisma.TransactionClient, name: string) {
  const existing = await tx.vendor.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return existing ?? (await tx.vendor.create({ data: { name }, select: { id: true } }));
}

function parseSkillsCsv(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function readJob(formData: FormData) {
  return jobSchema.safeParse({
    title: formData.get("title") ?? "",
    clientId: formData.get("clientId") ?? "",
    vendorId: formData.get("vendorId") ?? "",
    sisterCompanySourceId: formData.get("sisterCompanySourceId") ?? "",
    sourceOther: formData.get("sourceOther") ?? "",
    status: formData.get("status") ?? "OPEN",
    location: formData.get("location") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    vendorRate: formData.get("vendorRate") ?? "",
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
    workMode: formData.get("workMode") ?? "",
    priority: formData.get("priority") ?? "",
    targetCloseDate: formData.get("targetCloseDate") ?? "",
    postingUrl: formData.get("postingUrl") ?? "",
    workAuthRequirement: formData.get("workAuthRequirement") ?? "",
    skills: formData.get("skills") ?? "",
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

  // Inline "+ Add new client/vendor" — full-access only (matches Settings org
  // writes). Recruiters may create jobs, but not new org entities.
  const canCreateOrg = canManageOrgEntities(user);
  const newClientName = String(formData.get("newClientName") ?? "").trim();
  const newVendorName = String(formData.get("newVendorName") ?? "").trim();
  const wantNewClient = d.clientId === NEW_ORG_ENTITY;
  const wantNewVendor = d.vendorId === NEW_ORG_ENTITY;
  if ((wantNewClient || wantNewVendor) && !canCreateOrg)
    return {
      error: "Only managers and team leads can add a new client or vendor.",
    };
  const orgErrors: Record<string, string> = {};
  if (wantNewClient && !newClientName)
    orgErrors.clientId = "Enter the new client name.";
  if (wantNewVendor && !newVendorName)
    orgErrors.vendorId = "Enter the new vendor name.";
  if (Object.keys(orgErrors).length)
    return { error: "Please fix the highlighted fields.", fieldErrors: orgErrors };

  const job = await prisma.$transaction(async (tx) => {
    // Resolve inline-added client/vendor first (create-or-reuse by name).
    const clientId = wantNewClient
      ? (await findOrCreateClient(tx, newClientName)).id
      : d.clientId;
    const vendorId = wantNewVendor
      ? (await findOrCreateVendor(tx, newVendorName)).id
      : d.vendorId;

    const created = await tx.job.create({
      data: {
        title: d.title,
        clientId,
        vendorId,
        sisterCompanySourceId: isOtherSource ? null : d.sisterCompanySourceId,
        sourceOther: isOtherSource ? (d.sourceOther ?? null) : null,
        status: d.status,
        location: d.location ?? null,
        clientRate: d.clientRate ?? null,
        vendorRate: d.vendorRate ?? null,
        description: d.description ?? null,
        notes: d.notes ?? null,
        positions: d.positions ?? null,
        reqType: d.reqType ?? null,
        department: d.department ?? null,
        durationLabel: d.durationLabel ?? null,
        atsId: d.atsId ?? null,
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
        workMode: d.workMode ?? null,
        priority: d.priority ?? null,
        targetCloseDate: d.targetCloseDate ?? null,
        postingUrl: d.postingUrl ?? null,
        workAuthRequirement: d.workAuthRequirement ?? null,
        skills: parseSkillsCsv(d.skills),
        createdById: user.id,
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

  const existing = await prisma.job.findUnique({ where: { id: jobId } });
  if (!existing) return { error: "This job no longer exists." };

  // Recruiters may edit basic job details + status, but NOT the commercial
  // rates — those are manager/team-lead only. For a recruiter, force the rate
  // inputs back to their stored values so a hand-crafted POST can't change them
  // (the form also hides these controls). Recruiter ownership is a VPR concern.
  const canRates = canEditJobRatesAndAssignment(user);
  const effClientRate = canRates
    ? (d.clientRate ?? null)
    : existing.clientRate != null
      ? Number(existing.clientRate)
      : null;
  const effVendorRate = canRates
    ? (d.vendorRate ?? null)
    : existing.vendorRate != null
      ? Number(existing.vendorRate)
      : null;

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
  compare("client rate", existing.clientRate?.toString(), effClientRate);
  compare("vendor rate", existing.vendorRate?.toString(), effVendorRate);
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
  compare("work mode", existing.workMode, d.workMode);
  compare("priority", existing.priority, d.priority);
  compare(
    "target close date",
    existing.targetCloseDate?.toISOString(),
    d.targetCloseDate?.toISOString(),
  );
  compare("posting URL", existing.postingUrl, d.postingUrl);
  compare("work auth", existing.workAuthRequirement, d.workAuthRequirement);
  const nextSkills = parseSkillsCsv(d.skills);
  compare("skills", existing.skills.join(", "), nextSkills.join(", "));

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
        clientRate: effClientRate,
        vendorRate: effVendorRate,
        description: d.description ?? null,
        notes: d.notes ?? null,
        positions: d.positions ?? null,
        reqType: d.reqType ?? null,
        department: d.department ?? null,
        durationLabel: d.durationLabel ?? null,
        atsId: d.atsId ?? null,
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
        workMode: d.workMode ?? null,
        priority: d.priority ?? null,
        targetCloseDate: d.targetCloseDate ?? null,
        postingUrl: d.postingUrl ?? null,
        workAuthRequirement: d.workAuthRequirement ?? null,
        skills: nextSkills,
      },
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
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

/**
 * Quick status change from the job detail page (covers spec §9.2 "Close job").
 * Returns a `FormState` (rather than `void`) so the client wrapper can confirm
 * the save with a toast — this control used to update silently.
 */
export async function changeJobStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const jobId = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!jobId) return { error: "Missing job reference." };
  if (!(JOB_STATUS_VALUES as readonly string[]).includes(status))
    return { error: "That status is not valid." };

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { error: "This job no longer exists." };
  if (job.status === status)
    return { error: "Status is already set to that value." };
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
  return {
    ok: true,
    toast: { title: `Job status updated to ${JOB_STATUS_LABEL[next]}` },
  };
}
