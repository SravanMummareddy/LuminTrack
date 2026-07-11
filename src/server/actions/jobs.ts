"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  canQuickAddOrgEntities,
  canEditJobRatesAndAssignment,
  hasFullAccess,
} from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { isTerminalJobStatus } from "@/lib/job-flow";
import {
  hardEraseJob,
  JOB_TRASH_RETENTION_DAYS,
  JOB_ARCHIVE_PREFIX,
} from "@/server/job-erase";
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
    discipline: formData.get("discipline") ?? "",
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

  // Inline "+ Add new client/vendor" — any signed-in user may quick-add while
  // working (curation/rename/deactivate stays manager-only, in Settings).
  const canCreateOrg = canQuickAddOrgEntities(user);
  const newClientName = String(formData.get("newClientName") ?? "").trim();
  const newVendorName = String(formData.get("newVendorName") ?? "").trim();
  const wantNewClient = d.clientId === NEW_ORG_ENTITY;
  const wantNewVendor = d.vendorId === NEW_ORG_ENTITY;
  if ((wantNewClient || wantNewVendor) && !canCreateOrg)
    return {
      error: "You must be signed in to add a new client or vendor.",
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
        discipline: d.discipline ?? null,
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
  // Compare as numbers — existing.*Rate is a Prisma Decimal whose toString()
  // ("100.00") never string-equals the numeric form (100), so the old compare
  // flagged rates as changed on every edit.
  compare(
    "client rate",
    existing.clientRate != null ? Number(existing.clientRate) : null,
    effClientRate,
  );
  compare(
    "vendor rate",
    existing.vendorRate != null ? Number(existing.vendorRate) : null,
    effVendorRate,
  );
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
        discipline: d.discipline ?? null,
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
  // Closing/filling/cancelling a job retires its open requirements too — they
  // can't be worked once the job is done (same cascade as trashing a job). A
  // job that FILLED succeeded, so its reqs read "fulfilled" (CONVERTED); a job
  // that closed/cancelled was abandoned, so they read "cancelled".
  const closing = isTerminalJobStatus(next);
  const fulfilled = next === "FILLED";
  const vprVerb = fulfilled ? "fulfilled" : "cancelled";

  let closedVprs = 0;
  await prisma.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: next } });
    if (closing) {
      const res = await tx.vendorRequirement.updateMany({
        where: { jobId, status: "OPEN" },
        data: { status: fulfilled ? "CONVERTED" : "CANCELLED" },
      });
      closedVprs = res.count;
    }
    await logActivity(tx, {
      entityType: "JOB",
      action: "JOB_UPDATED",
      description:
        `Status changed from ${JOB_STATUS_LABEL[job.status]} to ${JOB_STATUS_LABEL[next]}` +
        (closedVprs > 0
          ? ` — ${vprVerb} ${closedVprs} open requirement${closedVprs === 1 ? "" : "s"}`
          : ""),
      oldValue: JOB_STATUS_LABEL[job.status],
      newValue: JOB_STATUS_LABEL[next],
      performedById: user.id,
      jobId,
    });
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/vendor-portal");
  return {
    ok: true,
    toast: {
      title: `Job status updated to ${JOB_STATUS_LABEL[next]}`,
      ...(closedVprs > 0
        ? {
            description: `${closedVprs} open requirement${closedVprs === 1 ? "" : "s"} ${vprVerb}.`,
          }
        : {}),
    },
  };
}

/**
 * Bulk status change for the selected jobs. Same permissions + per-job audit as
 * changeJobStatus. Skips jobs already at the target status; caps the id set so a
 * request can't touch the whole table.
 */
export async function bulkChangeJobStatus(
  formData: FormData,
): Promise<{ changed: number; skipped: number }> {
  const user = await requireUser();
  // Blast radius: up to 200 jobs, each cascading its open VPRs to
  // CANCELLED/CONVERTED. Restrict to managers / team leads, mirroring
  // bulkChangeSubmissionStatus.
  if (!hasFullAccess(user)) return { changed: 0, skipped: 0 };
  const status = String(formData.get("status") ?? "");
  if (!(JOB_STATUS_VALUES as readonly string[]).includes(status))
    return { changed: 0, skipped: 0 };
  const next = status as (typeof JOB_STATUS_VALUES)[number];
  const closing = isTerminalJobStatus(next);
  const fulfilled = next === "FILLED";
  const vprVerb = fulfilled ? "fulfilled" : "cancelled";

  const ids = [
    ...new Set(formData.getAll("ids").map(String).filter(Boolean)),
  ].slice(0, 200);
  if (!ids.length) return { changed: 0, skipped: 0 };

  const jobs = await prisma.job.findMany({
    where: { id: { in: ids }, status: { not: next } },
    select: { id: true, status: true },
  });
  await prisma.$transaction(async (tx) => {
    for (const j of jobs) {
      await tx.job.update({ where: { id: j.id }, data: { status: next } });
      // Same cascade as the single close/trash: retire the job's open reqs.
      let closedVprs = 0;
      if (closing) {
        const res = await tx.vendorRequirement.updateMany({
          where: { jobId: j.id, status: "OPEN" },
          data: { status: fulfilled ? "CONVERTED" : "CANCELLED" },
        });
        closedVprs = res.count;
      }
      await logActivity(tx, {
        entityType: "JOB",
        action: "JOB_UPDATED",
        description:
          `Status changed from ${JOB_STATUS_LABEL[j.status]} to ${JOB_STATUS_LABEL[next]} (bulk)` +
          (closedVprs > 0
            ? ` — ${vprVerb} ${closedVprs} open requirement${closedVprs === 1 ? "" : "s"}`
            : ""),
        oldValue: JOB_STATUS_LABEL[j.status],
        newValue: JOB_STATUS_LABEL[next],
        performedById: user.id,
        jobId: j.id,
      });
    }
  });
  revalidatePath("/jobs");
  if (closing) revalidatePath("/vendor-portal");
  return { changed: jobs.length, skipped: ids.length - jobs.length };
}

// ── Job lifecycle: trash → restore → erase (admin/manager only) ─────────────

/**
 * Move a job to trash: hidden everywhere, restorable, and scheduled to auto-erase
 * after the retention window. The ladder is Open → Close → Trash; if the job is
 * still Open/On-hold, trashing Closes it first (the UI confirms this). Its OPEN
 * vendor requirements are auto-cancelled. Blocked only while an ACTIVE placement
 * exists — end that first. Submissions are kept (they stay in the submissions
 * list as history).
 */
export async function trashJob(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!hasFullAccess(user))
    return { error: "Only managers and team leads can trash a job." };

  const jobId = String(formData.get("id") ?? "").trim();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true, deletedAt: true, erasedAt: true },
  });
  if (!job) return { error: "Job not found." };
  if (job.erasedAt) return { error: "This job has already been erased." };
  if (job.deletedAt) return { error: "This job is already in trash." };

  const activePlacements = await prisma.placement.count({
    where: { jobId, status: { in: ["ACTIVE", "EXTENDED"] } },
  });
  if (activePlacements > 0)
    return {
      error: "This job has an active placement — end the placement first.",
    };

  const willClose = !isTerminalJobStatus(job.status);
  const purgeOn = new Date(
    Date.now() + JOB_TRASH_RETENTION_DAYS * 86_400_000,
  );
  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: {
        deletedAt: new Date(),
        // Auto-close an Open/On-hold job on the way to trash.
        ...(willClose ? { status: "CLOSED" as const } : {}),
      },
    });
    // Auto-cancel any OPEN requirements — they can't be worked once the job's gone.
    await tx.vendorRequirement.updateMany({
      where: { jobId, status: "OPEN" },
      data: { status: "CANCELLED" },
    });
    await logActivity(tx, {
      entityType: "JOB",
      action: "JOB_UPDATED",
      description: `${willClose ? "Closed + moved" : "Moved"} to trash — auto-erases ${purgeOn.toISOString().slice(0, 10)}`,
      performedById: user.id,
      jobId,
    });
  });

  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

/** Restore a trashed job before the retention window lapses (keeps its status). */
export async function restoreJobFromTrash(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasFullAccess(user)) return;
  const jobId = String(formData.get("id") ?? "").trim();
  if (!jobId) return;
  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: { deletedAt: null },
    });
    await logActivity(tx, {
      entityType: "JOB",
      action: "JOB_UPDATED",
      description: "Restored from trash",
      performedById: user.id,
      jobId,
    });
  });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
}

/**
 * Permanently erase a trashed job now (admin + type-the-title confirm). Backs up
 * to Blob then, per the history-protecting policy, either hard-removes an empty
 * job or tombstones one with submissions. Only reachable from trash.
 */
export async function eraseJobNow(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!hasFullAccess(user))
    return { error: "Only managers and team leads can erase a job." };

  const jobId = String(formData.get("id") ?? "").trim();
  const confirmTitle = String(formData.get("confirmTitle") ?? "").trim();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { title: true, deletedAt: true, erasedAt: true },
  });
  if (!job) return { error: "Job not found." };
  if (job.erasedAt) return { error: "This job has already been erased." };
  if (!job.deletedAt)
    return { error: "Move the job to trash before erasing it." };
  if (confirmTitle !== job.title)
    return {
      fieldErrors: { confirmTitle: "Type the job's title exactly to confirm." },
    };

  await hardEraseJob(jobId, user.id);
  revalidatePath("/jobs");
  // The row may be gone (empty job) — send them to the list, not a 404 detail.
  redirect("/jobs?trash=1");
}

/**
 * "Remove for good" — permanently delete a stored job backup zip from Blob.
 * Admin only; confined to the job-archive prefix.
 */
export async function removeJobArchive(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasFullAccess(user)) return;
  const pathname = String(formData.get("pathname") ?? "").trim();
  if (!pathname.startsWith(JOB_ARCHIVE_PREFIX)) return;
  // Delete by the prefix-validated pathname only. The old code fell back to a
  // caller-supplied `url` that was never checked against the prefix, so a
  // request could pass a valid pathname to clear the guard yet delete an
  // arbitrary blob (résumés, other backups).
  await del(pathname);
  // Deliberate exception to the "write + audit in one $transaction" rule: a Blob
  // delete can't join a DB transaction, so the audit row is logged separately
  // after it (worst case is an audit gap on a crash, not a data problem).
  // (review IN-02)
  await logActivity(prisma, {
    entityType: "JOB",
    action: "JOB_ERASED",
    description: `Removed job backup ${pathname.split("/").pop()} — no longer recoverable`,
    performedById: user.id,
  });
  revalidatePath("/settings");
}
