"use server";

import { revalidatePath } from "next/cache";
import { prisma, isUniqueConstraintError } from "@/server/db";
import { requireUser } from "@/lib/session";
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
    isActive: formData.get("isActive") != null,
  });
}

/** Clients, vendors, and sister-company sources are shared org records that
 *  every job references — letting any recruiter rename or deactivate them
 *  would silently invalidate other people's work. Admin-only for writes. */
async function requireAdmin(): Promise<FormState | { ok: true }> {
  const actor = await requireUser();
  if (actor.role !== "ADMIN")
    return { error: "Only admins can manage clients, vendors, and sources." };
  return { ok: true };
}

export async function saveSisterCompany(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await requireAdmin();
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
  const gate = await requireAdmin();
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
  const gate = await requireAdmin();
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
