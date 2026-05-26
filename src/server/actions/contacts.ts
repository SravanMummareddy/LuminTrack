"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

/** §B1 contacts live under one of three parent kinds. The schema's CHECK
 *  constraint enforces "exactly one" at the DB layer; this enum gates which
 *  FK we set when writing. */
export const CONTACT_KINDS = ["client", "vendor", "source"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

const KIND_FK: Record<ContactKind, "clientId" | "vendorId" | "sourceId"> = {
  client: "clientId",
  vendor: "vendorId",
  source: "sourceId",
};

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Enter a valid email.",
    })
    .transform((v) => (v === "" ? null : v)),
  phone: z
    .string()
    .trim()
    .max(64)
    .transform((v) => (v === "" ? null : v)),
  role: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v)),
  isPrimary: z.boolean().default(false),
});

async function requireAdmin(): Promise<FormState | { ok: true }> {
  const actor = await requireUser();
  if (actor.role !== "ADMIN")
    return { error: "Only admins can manage contacts." };
  return { ok: true };
}

function parsedKind(formData: FormData): ContactKind | null {
  const raw = String(formData.get("kind") ?? "");
  return (CONTACT_KINDS as readonly string[]).includes(raw)
    ? (raw as ContactKind)
    : null;
}

export async function saveContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await requireAdmin();
  if ("error" in gate) return gate;
  const kind = parsedKind(formData);
  const parentId = String(formData.get("parentId") ?? "").trim();
  if (!kind || !parentId) return { error: "Missing contact parent." };

  const parsed = contactSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    role: formData.get("role") ?? "",
    isPrimary: formData.get("isPrimary") != null,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const id = String(formData.get("id") ?? "").trim();
  const fk = KIND_FK[kind];
  const data = { ...parsed.data, [fk]: parentId };

  // When marking primary, demote any other primary contact on the same parent
  // in the same transaction so the "single primary" intent holds without a DB
  // constraint (a partial unique index would force one primary even if none
  // is wanted).
  await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.contact.updateMany({
        where: { [fk]: parentId, isPrimary: true, NOT: id ? { id } : undefined },
        data: { isPrimary: false },
      });
    }
    if (id) await tx.contact.update({ where: { id }, data });
    else await tx.contact.create({ data });
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteContact(formData: FormData): Promise<void> {
  const gate = await requireAdmin();
  if ("error" in gate) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.contact.delete({ where: { id } });
  revalidatePath("/settings");
}
