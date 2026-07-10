"use server";

import { revalidatePath } from "next/cache";
import { prisma, isUniqueConstraintError } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canManageOrgEntities } from "@/lib/permissions";
import { contactOrgSchema, clientSchema } from "@/lib/validation/org";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

function readContactOrg(formData: FormData) {
  return contactOrgSchema.safeParse({
    name: formData.get("name") ?? "",
    contactPerson: formData.get("contactPerson") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    location: formData.get("location") ?? "",
    notes: formData.get("notes") ?? "",
    recruitedBy: formData.get("recruitedBy") ?? "",
    isActive: formData.get("isActive") != null,
  });
}

/** Resolve the vendor's "Recruited by" free-text into a link + fallback: an
 *  exact (case-insensitive) match against an active user becomes a real FK;
 *  anything else is kept as a plain name; blank clears both. Never sets both. */
async function resolveRecruitedBy(
  typed: string | undefined,
): Promise<{ recruitedById: string | null; recruitedByName: string | null }> {
  const value = (typed ?? "").trim();
  if (!value) return { recruitedById: null, recruitedByName: null };
  const user = await prisma.user.findFirst({
    where: { isActive: true, fullName: { equals: value, mode: "insensitive" } },
    select: { id: true },
  });
  return user
    ? { recruitedById: user.id, recruitedByName: null }
    : { recruitedById: null, recruitedByName: value };
}

/** Clients, vendors, and sister-company sources are shared org records that
 *  every job references — letting any recruiter rename or deactivate them
 *  would silently invalidate other people's work. Admin-only for writes. */
async function requireOrgManager(): Promise<FormState | { ok: true }> {
  const actor = await requireUser();
  if (!canManageOrgEntities(actor))
    return {
      error:
        "Only managers and team leads can manage clients, vendors, and sources.",
    };
  return { ok: true };
}

export async function saveSisterCompany(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await requireOrgManager();
  if ("error" in gate) return gate;
  const id = String(formData.get("id") ?? "").trim();
  const parsed = readContactOrg(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const data = {
    name: parsed.data.name,
    contactPerson: parsed.data.contactPerson ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    location: parsed.data.location ?? null,
    notes: parsed.data.notes ?? null,
    isActive: parsed.data.isActive,
  };

  try {
    if (id) await prisma.sisterCompanySource.update({ where: { id }, data });
    else await prisma.sisterCompanySource.create({ data });
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { fieldErrors: { name: "A source with this name already exists." } };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function saveVendor(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await requireOrgManager();
  if ("error" in gate) return gate;
  const id = String(formData.get("id") ?? "").trim();
  const parsed = readContactOrg(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const recruited = await resolveRecruitedBy(parsed.data.recruitedBy);
  const data = {
    name: parsed.data.name,
    contactPerson: parsed.data.contactPerson ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    location: parsed.data.location ?? null,
    notes: parsed.data.notes ?? null,
    recruitedById: recruited.recruitedById,
    recruitedByName: recruited.recruitedByName,
    isActive: parsed.data.isActive,
  };

  try {
    if (id) await prisma.vendor.update({ where: { id }, data });
    else await prisma.vendor.create({ data });
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { fieldErrors: { name: "A vendor with this name already exists." } };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function saveClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await requireOrgManager();
  if ("error" in gate) return gate;
  const id = String(formData.get("id") ?? "").trim();
  const parsed = clientSchema.safeParse({
    name: formData.get("name") ?? "",
    contactPerson: formData.get("contactPerson") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    location: formData.get("location") ?? "",
    notes: formData.get("notes") ?? "",
    isActive: formData.get("isActive") != null,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const data = {
    name: parsed.data.name,
    contactPerson: parsed.data.contactPerson ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    location: parsed.data.location ?? null,
    notes: parsed.data.notes ?? null,
    isActive: parsed.data.isActive,
  };

  try {
    if (id) await prisma.client.update({ where: { id }, data });
    else await prisma.client.create({ data });
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { fieldErrors: { name: "A client with this name already exists." } };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}
