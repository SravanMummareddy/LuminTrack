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

/** Active recruiters as `{id, fullName}` for filter dropdowns. Excludes
 *  admins and inactive users. Dedupes by `fullName` (keeps most-recently-
 *  updated) so accidental seed duplicates don't double up in the UI. */
export async function listActiveRecruiterOptions() {
  const rows = await prisma.user.findMany({
    where: { isActive: true, role: "RECRUITER" },
    select: { id: true, fullName: true, updatedAt: true },
    orderBy: [{ fullName: "asc" }, { updatedAt: "desc" }],
  });
  const seen = new Set<string>();
  const out: { id: string; fullName: string }[] = [];
  for (const r of rows) {
    const key = r.fullName.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.id, fullName: r.fullName });
  }
  return out;
}

/** Team leads + managers as `{id, fullName}` for the "Team lead" picker on the
 *  requirement + submission forms. Storing the picked name (not an id) keeps the
 *  existing string column, but a dropdown of real users prevents the free-text
 *  spelling drift that split one lead across several buckets. */
export async function listTeamLeadOptions(): Promise<
  { id: string; fullName: string }[]
> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["MANAGER", "TEAM_LEAD"] } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return rows.map((r) => ({ id: r.id, fullName: r.fullName }));
}

/** Distinct non-empty team labels across recruiters — powers the Monthly
 *  Performance team filter. Empty when nobody has been assigned a team yet. */
export async function listTeamLabels(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: "RECRUITER", teamLabel: { not: null } },
    distinct: ["teamLabel"],
    select: { teamLabel: true },
    orderBy: { teamLabel: "asc" },
  });
  return rows.map((r) => r.teamLabel).filter((t): t is string => !!t);
}

export type OrgListItem = Awaited<ReturnType<typeof listVendors>>[number];
export type ClientListItem = Awaited<ReturnType<typeof listClients>>[number];
export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];
