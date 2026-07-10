"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canManageOrgEntities } from "@/lib/permissions";
import { supportProviderSchema, parseSkills } from "@/lib/validation/support";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

/**
 * Create or update a support provider (external interview-support individual).
 * Managers + team leads only, matching the other org-reference entities.
 */
export async function saveSupportProvider(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageOrgEntities(actor))
    return { error: "Only managers and team leads can manage support providers." };

  const id = String(formData.get("id") ?? "").trim();
  const parsed = supportProviderSchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    discipline: formData.get("discipline") ?? "",
    skills: parseSkills(formData.get("skills")),
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
    isActive: formData.get("isActive") != null,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const data = {
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    discipline: parsed.data.discipline ?? null,
    skills: parsed.data.skills,
    reference: parsed.data.reference ?? null,
    notes: parsed.data.notes ?? null,
    isActive: parsed.data.isActive,
  };

  if (id) await prisma.supportProvider.update({ where: { id }, data });
  else await prisma.supportProvider.create({ data });

  revalidatePath("/settings");
  return { ok: true };
}
