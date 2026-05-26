import { prisma } from "@/server/db";

// Each list now includes a contact count so the settings UI can render
// "Contacts (N)" links without a follow-up roundtrip.
// Include each parent's contacts inline. Volume is bounded (single-digit
// per entity), so the settings page reads cheap. Primary first.
const contactsInclude = {
  contacts: {
    orderBy: [
      { isPrimary: "desc" as const },
      { updatedAt: "desc" as const },
    ],
  },
};

export function listSisterCompanies() {
  return prisma.sisterCompanySource.findMany({
    orderBy: { name: "asc" },
    include: contactsInclude,
  });
}

export function listClients() {
  return prisma.client.findMany({
    orderBy: { name: "asc" },
    include: contactsInclude,
  });
}

export function listVendors() {
  return prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: contactsInclude,
  });
}

import type { ContactKind } from "@/server/actions/contacts";

export function listContacts(kind: ContactKind, parentId: string) {
  const where =
    kind === "client"
      ? { clientId: parentId }
      : kind === "vendor"
        ? { vendorId: parentId }
        : { sourceId: parentId };
  return prisma.contact.findMany({
    where,
    // Primary first, then most-recently-edited; stable + matches the UI
    // expectation that "the important one" stays on top.
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });
}

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];

/** App users — never selects passwordHash, so the result is safe to pass to client components. */
export function listUsers() {
  return prisma.user.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export type OrgListItem = Awaited<ReturnType<typeof listVendors>>[number];
export type ClientListItem = Awaited<ReturnType<typeof listClients>>[number];
export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];
