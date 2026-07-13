"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { canManageOrgEntities } from "@/lib/permissions";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";
import { CONTACT_KINDS, type ContactKind } from "@/lib/contact-kinds";

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

// NOTE: contact create/update AND the hard `deleteContact` below write no
// `Activity` audit row (the model has no contact relation; adding one is a
// schema migration). Manager-gated, so this is a documented trade-off, not an
// oversight — see review IN-03 and the matching note in org.ts.
async function requireAdmin(): Promise<FormState | { ok: true }> {
  const actor = await requireUser();
  if (!canManageOrgEntities(actor))
    return { error: "Only managers and team leads can manage contacts." };
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
  const db = await getScopedPrisma();
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
  // On edit, the contact's parent is fixed — reject any request that tries to
  // reparent it to a different entity (a crafted POST could otherwise submit an
  // existing contact's id with someone else's kind/parentId and silently move
  // it, demoting the new parent's primary). Contacts write no audit row, so this
  // must be guarded here.
  if (id) {
    const existing = await db.contact.findUnique({
      where: { id },
      select: { clientId: true, vendorId: true, sourceId: true },
    });
    if (!existing) return { error: "Contact not found." };
    if ((existing as Record<string, string | null>)[fk] !== parentId)
      return { error: "This contact belongs to a different record." };
  }

  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const gate = await requireAdmin();
  if ("error" in gate) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await db.contact.delete({ where: { id } });
  revalidatePath("/settings");
}
