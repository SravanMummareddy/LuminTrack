"use server";

import { revalidatePath } from "next/cache";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { canQuickAddOrgEntities } from "@/lib/permissions";

// Quick-add of a client / vendor / referrer inline from the Job form's dialog.
// Any signed-in user may quick-add while working (curation stays manager-only in
// Settings); each new row records `createdById`, so the Settings list shows who
// added it. Returns the created (or case-insensitively reused) row for the form
// to select. Distinct from the manager-gated `save*` actions in `org.ts`.

export type QuickAddResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string };

const field = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v || null;
};

export async function quickAddClient(fd: FormData): Promise<QuickAddResult> {
  const user = await requireUser();
  if (!canQuickAddOrgEntities(user))
    return { ok: false, error: "You can't add a client." };
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name." };
  const db = await getScopedPrisma();
  const existing = await db.client.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return { ok: true, ...existing };
  const created = await db.client.create({
    data: {
      name,
      contactPerson: field(fd, "contactPerson"),
      email: field(fd, "email"),
      phone: field(fd, "phone"),
      location: field(fd, "location"),
      notes: field(fd, "notes"),
      createdById: user.id,
    },
    select: { id: true, name: true },
  });
  revalidatePath("/settings");
  return { ok: true, ...created };
}

export async function quickAddVendor(fd: FormData): Promise<QuickAddResult> {
  const user = await requireUser();
  if (!canQuickAddOrgEntities(user))
    return { ok: false, error: "You can't add a vendor." };
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name." };
  const db = await getScopedPrisma();
  const existing = await db.vendor.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return { ok: true, ...existing };
  const created = await db.vendor.create({
    data: {
      name,
      contactPerson: field(fd, "contactPerson"),
      email: field(fd, "email"),
      phone: field(fd, "phone"),
      location: field(fd, "location"),
      notes: field(fd, "notes"),
      recruitedByName: field(fd, "recruitedByName"),
      createdById: user.id,
    },
    select: { id: true, name: true },
  });
  revalidatePath("/settings");
  return { ok: true, ...created };
}

export async function quickAddReferrer(fd: FormData): Promise<QuickAddResult> {
  const user = await requireUser();
  if (!canQuickAddOrgEntities(user))
    return { ok: false, error: "You can't add a referrer." };
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name." };
  const db = await getScopedPrisma();
  const existing = await db.referrer.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return { ok: true, ...existing };
  const created = await db.referrer.create({
    data: {
      name,
      email: field(fd, "email"),
      phone: field(fd, "phone"),
      company: field(fd, "company"),
      notes: field(fd, "notes"),
      createdById: user.id,
    },
    select: { id: true, name: true },
  });
  revalidatePath("/settings");
  return { ok: true, ...created };
}
