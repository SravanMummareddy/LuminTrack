"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canViewBenchCredentials } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import {
  benchConsultantSchema,
  type BenchConsultantInput,
} from "@/lib/validation/bench";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

function parseSkills(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

function readBenchConsultant(formData: FormData) {
  return benchConsultantSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    currentLocation: formData.get("currentLocation") ?? "",
    workAuthorization: formData.get("workAuthorization") ?? "",
    mVisa: formData.get("mVisa") ?? "",
    aVisa: formData.get("aVisa") ?? "",
    marketingExpYears: formData.get("marketingExpYears") ?? "",
    realTimeExpYears: formData.get("realTimeExpYears") ?? "",
    technology: formData.get("technology") ?? "",
    skills: parseSkills(formData.get("skills")),
    reference: formData.get("reference") ?? "",
    company: formData.get("company") ?? "",
    projectType: formData.get("projectType") ?? "",
    leastRateC2C: formData.get("leastRateC2C") ?? "",
    callType: formData.get("callType") ?? "",
    payrollType: formData.get("payrollType") ?? "",
    relocation: formData.get("relocation") != null,
    marketingStartDate: formData.get("marketingStartDate") ?? "",
    marketingEmail: formData.get("marketingEmail") ?? "",
    marketingPassword: formData.get("marketingPassword") ?? "",
    marketingNumber: formData.get("marketingNumber") ?? "",
    personalNumber: formData.get("personalNumber") ?? "",
    priority: formData.get("priority") ?? "SECOND",
    marketingStatus: formData.get("marketingStatus") ?? "ACTIVE",
    notes: formData.get("notes") ?? "",
    isActive: formData.get("isActive") != null,
    recruiterId: formData.get("recruiterId") ?? "",
    candidateId: formData.get("candidateId") ?? "",
  });
}

/** Maps validated input to a Prisma data object (optionals → explicit nulls). */
function benchData(d: BenchConsultantInput) {
  return {
    fullName: d.fullName,
    email: d.email ?? null,
    phone: d.phone ?? null,
    currentLocation: d.currentLocation ?? null,
    workAuthorization: d.workAuthorization ?? null,
    mVisa: d.mVisa ?? null,
    aVisa: d.aVisa ?? null,
    marketingExpYears: d.marketingExpYears ?? null,
    realTimeExpYears: d.realTimeExpYears ?? null,
    technology: d.technology ?? null,
    skills: d.skills,
    reference: d.reference ?? null,
    company: d.company ?? null,
    projectType: d.projectType ?? null,
    leastRateC2C: d.leastRateC2C ?? null,
    callType: d.callType ?? null,
    payrollType: d.payrollType ?? null,
    relocation: d.relocation,
    marketingStartDate: d.marketingStartDate ?? null,
    marketingEmail: d.marketingEmail ?? null,
    marketingPassword: d.marketingPassword ?? null,
    marketingNumber: d.marketingNumber ?? null,
    personalNumber: d.personalNumber ?? null,
    priority: d.priority,
    marketingStatus: d.marketingStatus,
    notes: d.notes ?? null,
    isActive: d.isActive,
    recruiterId: d.recruiterId ?? null,
    candidateId: d.candidateId ?? null,
  };
}

/** The admin-gated marketing-credential fields. */
const CREDENTIAL_FIELDS = [
  "marketingEmail",
  "marketingPassword",
  "marketingNumber",
  "personalNumber",
] as const;

/** Remove credential fields from an update/create payload so a user who can't
 *  view them can neither set nor blank them. Deleting the keys (vs. setting
 *  null) means Prisma leaves any existing values untouched on update. */
function stripCredentials(data: ReturnType<typeof benchData>): void {
  const rec = data as Record<string, unknown>;
  for (const k of CREDENTIAL_FIELDS) delete rec[k];
}

export async function createBenchConsultant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readBenchConsultant(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const data = benchData(d);
  // Only credential-cleared users (admins) may set the gated marketing
  // credentials. For everyone else the form never renders those inputs, so we
  // strip them rather than persist blanks.
  if (!canViewBenchCredentials(user)) stripCredentials(data);

  const consultant = await prisma.$transaction(async (tx) => {
    const created = await tx.benchConsultant.create({
      data: { ...data, createdById: user.id },
    });
    await logActivity(tx, {
      entityType: "CONSULTANT",
      action: "BENCH_CONSULTANT_CREATED",
      description: `Bench consultant "${created.fullName}" added`,
      performedById: user.id,
      benchConsultantId: created.id,
    });
    return created;
  });

  revalidatePath("/bench");
  redirect(`/bench/${consultant.id}`);
}

export async function updateBenchConsultant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing consultant reference." };

  const parsed = readBenchConsultant(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.benchConsultant.findUnique({ where: { id } });
  if (!existing) return { error: "This consultant no longer exists." };

  // Record which fields changed for a meaningful audit entry (credentials are
  // referenced by name only, never logging the secret values).
  const changed: string[] = [];
  const compare = (label: string, before: unknown, after: unknown) => {
    if (String(before ?? "") !== String(after ?? "")) changed.push(label);
  };
  compare("name", existing.fullName, d.fullName);
  compare("email", existing.email, d.email);
  compare("phone", existing.phone, d.phone);
  compare("location", existing.currentLocation, d.currentLocation);
  compare("technology", existing.technology, d.technology);
  compare("skills", existing.skills.join(", "), d.skills.join(", "));
  compare("priority", existing.priority, d.priority);
  compare("marketing status", existing.marketingStatus, d.marketingStatus);
  compare("recruiter", existing.recruiterId, d.recruiterId);
  compare("linked candidate", existing.candidateId, d.candidateId);
  compare("notes", existing.notes, d.notes);
  compare("active", existing.isActive, d.isActive);

  const data = benchData(d);
  const canCreds = canViewBenchCredentials(user);
  // Non-admins can't see or edit credentials — their form omits those inputs, so
  // strip the (blank) credential fields here. Omitting them from the Prisma
  // update leaves the admin-set values untouched instead of wiping them.
  if (!canCreds) stripCredentials(data);
  else if (existing.marketingPassword !== (d.marketingPassword ?? null))
    changed.push("marketing credentials");

  await prisma.$transaction(async (tx) => {
    await tx.benchConsultant.update({ where: { id }, data });
    if (changed.length)
      await logActivity(tx, {
        entityType: "CONSULTANT",
        action: "BENCH_CONSULTANT_UPDATED",
        description: `Bench consultant updated (${changed.join(", ")})`,
        newValue: changed.join(", "),
        performedById: user.id,
        benchConsultantId: id,
      });
  });

  revalidatePath("/bench");
  revalidatePath(`/bench/${id}`);
  redirect(`/bench/${id}`);
}
