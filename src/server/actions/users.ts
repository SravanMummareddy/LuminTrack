"use server";

import { revalidatePath } from "next/cache";
import { prisma, isUniqueConstraintError } from "@/server/db";
import { requireUser } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { userCreateSchema, userUpdateSchema } from "@/lib/validation/user";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

export async function saveUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (actor.role !== "ADMIN")
    return { error: "Only administrators can manage users." };

  const id = String(formData.get("id") ?? "").trim();
  const raw = {
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "RECRUITER",
    isActive: formData.get("isActive") != null,
    password: formData.get("password") ?? "",
  };
  const parsed = id
    ? userUpdateSchema.safeParse(raw)
    : userCreateSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  // An admin must not be able to lock themselves out of the app.
  if (id && id === actor.id) {
    if (!parsed.data.isActive)
      return { error: "You cannot deactivate your own account." };
    if (parsed.data.role !== "ADMIN")
      return { error: "You cannot remove your own admin role." };
  }

  const fields = {
    fullName: parsed.data.fullName,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    isActive: parsed.data.isActive,
  };

  try {
    if (id) {
      await prisma.user.update({
        where: { id },
        data: parsed.data.password
          ? { ...fields, passwordHash: await hashPassword(parsed.data.password) }
          : fields,
      });
    } else {
      await prisma.user.create({
        data: {
          ...fields,
          passwordHash: await hashPassword(parsed.data.password ?? ""),
        },
      });
    }
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { fieldErrors: { email: "A user with this email already exists." } };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}
