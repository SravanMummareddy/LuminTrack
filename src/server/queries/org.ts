import { getScopedPrisma } from "@/lib/session";

// Each list now includes a contact count so the settings UI can render
// "Contacts (N)" links without a follow-up roundtrip.
// Include each parent's contacts inline. Volume is bounded (single-digit
// per entity), so the settings page reads cheap. Primary first.
// Who-added / who-updated audit names for the Settings admin lists.
const audit = {
  createdBy: { select: { fullName: true } },
  updatedBy: { select: { fullName: true } },
};

const contactsInclude = {
  contacts: {
    orderBy: [
      { isPrimary: "desc" as const },
      { updatedAt: "desc" as const },
    ],
  },
};

const jobsCount = { _count: { select: { jobs: true } } };

export async function listSisterCompanies() {
  const db = await getScopedPrisma();
  return db.sisterCompanySource.findMany({
    orderBy: { name: "asc" },
    include: { ...contactsInclude, ...audit, ...jobsCount },
  });
}

export async function listClients() {
  const db = await getScopedPrisma();
  return db.client.findMany({
    orderBy: { name: "asc" },
    include: { ...contactsInclude, ...audit, ...jobsCount },
  });
}

export async function listVendors() {
  const db = await getScopedPrisma();
  return db.vendor.findMany({
    orderBy: { name: "asc" },
    include: {
      ...contactsInclude,
      ...audit,
      ...jobsCount,
      // "Recruited by" — the linked owner (if any). Display falls back to the
      // free-text recruitedByName when no user is linked.
      recruitedBy: { select: { id: true, fullName: true } },
    },
  });
}

/** Full referrer rows for the Settings › Referrers admin tab (with audit). */
export async function listReferrersAdmin() {
  const db = await getScopedPrisma();
  return db.referrer.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { ...audit, ...jobsCount },
  });
}

export type OrgEntityKind = "client" | "vendor" | "source" | "referrer";
export const ORG_ENTITY_KINDS: OrgEntityKind[] = ["client", "vendor", "source", "referrer"];

export type OrgEntityContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
};
export type OrgEntityDetail = {
  kind: OrgEntityKind;
  id: string;
  seq: number;
  name: string;
  isActive: boolean;
  contactPerson: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
  recruitedByLabel: string | null;
  createdBy: { fullName: string } | null;
  updatedBy: { fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
  hasContacts: boolean;
  contacts: OrgEntityContact[];
  jobs: { id: string; seq: number; title: string; status: string }[];
};

/** Normalised detail for one org entity (Client/Vendor/Source/Referrer) — the
 *  data behind the manager-only detail page. Returns null for an unknown kind or
 *  a missing/cross-org id (org-scoping handles the tenancy filter). */
export async function getOrgEntityDetail(
  kind: string,
  id: string,
): Promise<OrgEntityDetail | null> {
  const db = await getScopedPrisma();
  const jobs = {
    select: { id: true, seq: true, title: true, status: true },
    orderBy: { createdAt: "desc" as const },
    take: 100,
  };
  const contacts = {
    orderBy: [{ isPrimary: "desc" as const }, { name: "asc" as const }],
  };
  const base = (r: {
    id: string; seq: number; name: string; isActive: boolean; email: string | null;
    phone: string | null; notes: string | null; createdBy: { fullName: string } | null;
    updatedBy: { fullName: string } | null; createdAt: Date; updatedAt: Date;
    jobs: { id: string; seq: number; title: string; status: string }[];
  }) => ({
    id: r.id, seq: r.seq, name: r.name, isActive: r.isActive, email: r.email,
    phone: r.phone, notes: r.notes, createdBy: r.createdBy, updatedBy: r.updatedBy,
    createdAt: r.createdAt, updatedAt: r.updatedAt, jobs: r.jobs,
  });

  if (kind === "client") {
    const r = await db.client.findUnique({ where: { id }, include: { ...audit, contacts, jobs } });
    if (!r) return null;
    return { kind, ...base(r), contactPerson: r.contactPerson, company: null, location: r.location, recruitedByLabel: null, hasContacts: true, contacts: r.contacts };
  }
  if (kind === "vendor") {
    const r = await db.vendor.findUnique({ where: { id }, include: { ...audit, contacts, jobs, recruitedBy: { select: { fullName: true } } } });
    if (!r) return null;
    return { kind, ...base(r), contactPerson: r.contactPerson, company: null, location: r.location, recruitedByLabel: r.recruitedBy?.fullName ?? r.recruitedByName ?? null, hasContacts: true, contacts: r.contacts };
  }
  if (kind === "source") {
    const r = await db.sisterCompanySource.findUnique({ where: { id }, include: { ...audit, contacts, jobs } });
    if (!r) return null;
    return { kind, ...base(r), contactPerson: r.contactPerson, company: null, location: r.location, recruitedByLabel: null, hasContacts: true, contacts: r.contacts };
  }
  if (kind === "referrer") {
    const r = await db.referrer.findUnique({ where: { id }, include: { ...audit, jobs } });
    if (!r) return null;
    return { kind, ...base(r), contactPerson: null, company: r.company, location: null, recruitedByLabel: null, hasContacts: false, contacts: [] };
  }
  return null;
}

/** Reusable referrer directory (source rework) — active first, by name. */
export async function listReferrers() {
  const db = await getScopedPrisma();
  return db.referrer.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
}

/** All active users as `{id, fullName}` — the suggestion pool for the vendor
 *  "Recruited by" picker (any role: recruiter, team lead, manager). Deduped by
 *  name so accidental seed duplicates don't double up. */
export async function listActiveUserOptions(): Promise<
  { id: string; fullName: string }[]
> {
  const db = await getScopedPrisma();
  const rows = await db.user.findMany({
    where: { isActive: true },
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

/** App users — never selects passwordHash, so the result is safe to pass to client components. */
export async function listUsers() {
  const db = await getScopedPrisma();
  return db.user.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      seq: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      teamId: true,
      team: { select: { name: true } },
      reportsToId: true,
      reportsTo: { select: { fullName: true } },
      showInOrgChart: true,
      roleId: true,
      assignedRole: { select: { name: true } },
    },
  });
}

/** Teams for the Settings "Teams" tab: name, lead, and member count. */
export async function listTeamsAdmin() {
  const db = await getScopedPrisma();
  return db.team.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      seq: true,
      name: true,
      leadId: true,
      lead: { select: { fullName: true } },
      _count: { select: { members: true } },
    },
  });
}

/** Active recruiters as `{id, fullName}` for filter dropdowns. Excludes
 *  admins and inactive users. Dedupes by `fullName` (keeps most-recently-
 *  updated) so accidental seed duplicates don't double up in the UI. */
export async function listActiveRecruiterOptions() {
  const db = await getScopedPrisma();
  const rows = await db.user.findMany({
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
  const db = await getScopedPrisma();
  const rows = await db.user.findMany({
    where: { isActive: true, role: { in: ["MANAGER", "TEAM_LEAD"] } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return rows.map((r) => ({ id: r.id, fullName: r.fullName }));
}

/** Teams that have at least one active recruiter — powers the Monthly
 *  Performance team filter. Empty when nobody has been assigned a team yet. */
export async function listTeams(): Promise<{ id: string; name: string }[]> {
  const db = await getScopedPrisma();
  return db.team.findMany({
    where: { members: { some: { role: "RECRUITER", isActive: true } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export type OrgListItem = Awaited<ReturnType<typeof listVendors>>[number];
export type ClientListItem = Awaited<ReturnType<typeof listClients>>[number];
export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];
