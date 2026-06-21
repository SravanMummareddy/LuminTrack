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
        workMode: d.workMode ?? null,
        priority: d.priority ?? null,
        targetCloseDate: d.targetCloseDate ?? null,
        postingUrl: d.postingUrl ?? null,
        workAuthRequirement: d.workAuthRequirement ?? null,
        skills: parseSkillsCsv(d.skills),
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
        workMode: d.workMode ?? null,
        priority: d.priority ?? null,
        targetCloseDate: d.targetCloseDate ?? null,
        postingUrl: d.postingUrl ?? null,
        workAuthRequirement: d.workAuthRequirement ?? null,
        skills: nextSkills,
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

/**
 * Inline recruiter assignment from the Jobs list. Admin-only — matches the
 * Tier 1 pattern for org-entity writes. Mirrors `updateJob`'s assignment-diff
 * block: computes toAdd / toRemove against the current set, then writes one
 * RECRUITER_ASSIGNED per added user and one RECRUITER_UNASSIGNED per removed
 * user, all inside a single transaction so the JobAssignment rows and the
 * audit entries commit atomically.
 */
export async function assignJobRecruiters(
  jobId: string,
  recruiterIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Only admins can change job assignments." };
  if (!jobId.trim()) return { ok: false, error: "Missing job reference." };

  // Defensive de-dup: client may send a stale checkbox state where the same
  // id appears twice. Empty strings are dropped.
  const desiredIds = Array.from(
    new Set(recruiterIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  );

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { assignments: { select: { recruiterId: true } } },
  });
  if (!job) return { ok: false, error: "This job no longer exists." };

  const currentSet = new Set(job.assignments.map((a) => a.recruiterId));
  const desiredSet = new Set(desiredIds);
  const toAdd = desiredIds.filter((id) => !currentSet.has(id));
  const toRemove = [...currentSet].filter((id) => !desiredSet.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) {
    // No-op — don't write a noise audit row.
    return { ok: true };
  }

  const affected = [...new Set([...toAdd, ...toRemove])];
  const affectedUsers = await prisma.user.findMany({
    where: { id: { in: affected } },
    select: { id: true, fullName: true },
  });
  const recruiterNames = new Map(
    affectedUsers.map((u) => [u.id, u.fullName] as const),
  );

  await prisma.$transaction(async (tx) => {
    if (toRemove.length)
      await tx.jobAssignment.deleteMany({
        where: { jobId, recruiterId: { in: toRemove } },
      });
    for (const recruiterId of toAdd)
      await tx.jobAssignment.create({
        data: { jobId, recruiterId, assignedById: user.id },
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
  return { ok: true };
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
