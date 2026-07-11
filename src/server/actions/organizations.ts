"use server";

import { revalidatePath } from "next/cache";
import { prisma, isUniqueConstraintError } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canManageOrganizations } from "@/lib/permissions";
import { organizationSchema } from "@/lib/validation/organization";
import { toFieldErrors } from "@/lib/validation/common";
import { seedRbac } from "@/server/rbac-seed";
import type { FormState } from "@/lib/form-state";

/**
 * Create or edit an organization (tenant). Platform-super-admin only — this is
 * the one cross-tenant write, so it uses the UNSCOPED base client (Organization
 * is a global table). Creating an org PROVISIONS it: `seedRbac` gives the new
 * tenant its own Manager / Team Lead / Recruiter system roles (+ the shared
 * permission catalog) so people can be added to it with working roles from day one.
 */
export async function saveOrganization(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageOrganizations(actor))
    return { error: "Only platform super-admins can manage organizations." };

  const id = String(formData.get("id") ?? "").trim();
  const parsed = organizationSchema.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    isActive: formData.get("isActive") != null,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    isActive: parsed.data.isActive,
  };

  try {
    if (id) {
      await prisma.organization.update({ where: { id }, data });
    } else {
      const org = await prisma.organization.create({ data });
      // Provision the new tenant's system roles so users added to it work.
      await seedRbac(prisma, org.id);
    }
  } catch (error) {
    if (isUniqueConstraintError(error))
      return {
        fieldErrors: { slug: "An organization with this slug already exists." },
      };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}
