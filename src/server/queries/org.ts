import { prisma } from "@/server/db";

export function listSisterCompanies() {
  return prisma.sisterCompanySource.findMany({ orderBy: { name: "asc" } });
}

export function listClients() {
  return prisma.client.findMany({ orderBy: { name: "asc" } });
}

export function listVendors() {
  return prisma.vendor.findMany({ orderBy: { name: "asc" } });
}

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
