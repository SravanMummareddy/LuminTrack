import { getScopedPrisma } from "@/lib/session";
import {
  formatUserDisplayId,
  formatTeamDisplayId,
  formatRoleDisplayId,
  formatOrganizationDisplayId,
  formatGlossaryDisplayId,
  formatDate,
  formatSubmissionDisplayId,
  formatJobDisplayId,
} from "@/lib/format";

// WS4 — detail pages for the admin entities (Users / Teams / Roles /
// Organizations / Glossary), mirroring the org-entity detail pages. All five map
// to one normalised shape so a single renderer covers them; each query loads the
// entity + its related records and returns null when it doesn't exist.

export type AdminEntityKind =
  | "user"
  | "team"
  | "role"
  | "organization"
  | "glossary";

export const ADMIN_ENTITY_KINDS: AdminEntityKind[] = [
  "user",
  "team",
  "role",
  "organization",
  "glossary",
];

type BadgeTone = "green" | "slate" | "indigo" | "amber";
type SummaryItem = { label: string; value: string; href?: string; wide?: boolean };
type CardItem = { left: string; href?: string; right?: string; mono?: boolean };
type Card = { title: string; count?: number; items: CardItem[]; emptyText: string };

export type AdminEntityDetail = {
  kind: AdminEntityKind;
  name: string;
  displayId: string;
  status: { label: string; tone: BadgeTone } | null;
  backTab: string;
  editHref: string;
  summary: SummaryItem[];
  cards: Card[];
};

const COARSE_ROLE: Record<string, string> = {
  MANAGER: "Manager",
  TEAM_LEAD: "Team Lead",
  RECRUITER: "Recruiter",
};

const RECENT = 6;

export async function getAdminEntityDetail(
  kind: string,
  id: string,
): Promise<AdminEntityDetail | null> {
  switch (kind) {
    case "user":
      return getUserDetail(id);
    case "team":
      return getTeamDetail(id);
    case "role":
      return getRoleDetail(id);
    case "organization":
      return getOrganizationDetail(id);
    case "glossary":
      return getGlossaryDetail(id);
    default:
      return null;
  }
}

async function getUserDetail(id: string): Promise<AdminEntityDetail | null> {
  const db = await getScopedPrisma();
  const u = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      fullName: true,
      email: true,
      empId: true,
      role: true,
      isActive: true,
      isPlatformAdmin: true,
      createdAt: true,
      updatedAt: true,
      assignedRole: { select: { label: true } },
      team: { select: { id: true, seq: true, name: true } },
      reportsTo: { select: { id: true, fullName: true } },
      _count: { select: { submissionsMade: true, jobsCreated: true } },
      submissionsMade: {
        take: RECENT,
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          seq: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      },
    },
  });
  if (!u) return null;

  return {
    kind: "user",
    name: u.fullName,
    displayId: formatUserDisplayId(u),
    status: u.isActive
      ? { label: "Active", tone: "green" }
      : { label: "Inactive", tone: "slate" },
    backTab: "users",
    editHref: `/settings?tab=users&edit=${u.id}`,
    summary: [
      { label: "Email", value: u.email },
      { label: "Employee ID", value: u.empId || "—" },
      {
        label: "Role",
        value:
          u.assignedRole?.label ?? COARSE_ROLE[u.role] ?? u.role,
      },
      u.team
        ? { label: "Team", value: u.team.name, href: `/settings/team/${u.team.id}` }
        : { label: "Team", value: "—" },
      {
        label: "Reports to",
        value: u.reportsTo?.fullName ?? "—",
        href: u.reportsTo ? `/settings/user/${u.reportsTo.id}` : undefined,
      },
      { label: "Platform admin", value: u.isPlatformAdmin ? "Yes" : "No" },
      { label: "Added", value: formatDate(u.createdAt) },
      { label: "Updated", value: formatDate(u.updatedAt) },
    ],
    cards: [
      {
        title: "Submissions made",
        count: u._count.submissionsMade,
        emptyText: "No submissions yet.",
        items: u.submissionsMade.map((s) => ({
          left: `${s.candidate?.fullName ?? "Candidate"} → ${s.job?.title ?? "—"}`,
          href: `/submissions/${s.id}`,
          right: formatSubmissionDisplayId(s),
        })),
      },
      {
        title: "Jobs created",
        count: u._count.jobsCreated,
        emptyText: "No jobs created.",
        items: [],
      },
    ],
  };
}

async function getTeamDetail(id: string): Promise<AdminEntityDetail | null> {
  const db = await getScopedPrisma();
  const t = await db.team.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      lead: { select: { id: true, fullName: true } },
      members: {
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, role: true },
      },
    },
  });
  if (!t) return null;

  return {
    kind: "team",
    name: t.name,
    displayId: formatTeamDisplayId(t),
    status: null,
    backTab: "teams",
    editHref: `/settings?tab=teams&edit=${t.id}`,
    summary: [
      {
        label: "Team lead",
        value: t.lead?.fullName ?? "— (no lead)",
        href: t.lead ? `/settings/user/${t.lead.id}` : undefined,
      },
      { label: "Members", value: String(t.members.length) },
      { label: "Added", value: formatDate(t.createdAt) },
      { label: "Updated", value: formatDate(t.updatedAt) },
    ],
    cards: [
      {
        title: "Members",
        count: t.members.length,
        emptyText: "No members yet.",
        items: t.members.map((m) => ({
          left: m.fullName,
          href: `/settings/user/${m.id}`,
          right: COARSE_ROLE[m.role] ?? m.role,
        })),
      },
    ],
  };
}

async function getRoleDetail(id: string): Promise<AdminEntityDetail | null> {
  const db = await getScopedPrisma();
  const r = await db.role.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      name: true,
      label: true,
      description: true,
      isSystem: true,
      createdAt: true,
      updatedAt: true,
      permissions: {
        select: { permission: { select: { key: true, label: true } } },
      },
      users: {
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      },
    },
  });
  if (!r) return null;

  return {
    kind: "role",
    name: r.label,
    displayId: formatRoleDisplayId(r),
    status: r.isSystem
      ? { label: "System role", tone: "indigo" }
      : { label: "Custom", tone: "slate" },
    backTab: "roles",
    editHref: `/settings?tab=roles&edit=${r.id}`,
    summary: [
      { label: "Key", value: r.name },
      { label: "Type", value: r.isSystem ? "System" : "Custom" },
      { label: "Permissions", value: String(r.permissions.length) },
      { label: "Users", value: String(r.users.length) },
      { label: "Description", value: r.description || "—", wide: true },
      { label: "Added", value: formatDate(r.createdAt) },
      { label: "Updated", value: formatDate(r.updatedAt) },
    ],
    cards: [
      {
        title: "Permissions granted",
        count: r.permissions.length,
        emptyText: "No permissions granted.",
        items: r.permissions
          .map((p) => ({ left: p.permission.key, right: p.permission.label, mono: true }))
          .sort((a, b) => a.left.localeCompare(b.left)),
      },
      {
        title: "Users with this role",
        count: r.users.length,
        emptyText: "No users hold this role.",
        items: r.users.map((u) => ({
          left: u.fullName,
          href: `/settings/user/${u.id}`,
        })),
      },
    ],
  };
}

async function getOrganizationDetail(
  id: string,
): Promise<AdminEntityDetail | null> {
  const db = await getScopedPrisma();
  const o = await db.organization.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { users: true, teams: true, roles: true } },
      teams: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { members: true } } },
      },
    },
  });
  if (!o) return null;

  return {
    kind: "organization",
    name: o.name,
    displayId: formatOrganizationDisplayId(o),
    status: o.isActive
      ? { label: "Active", tone: "green" }
      : { label: "Inactive", tone: "slate" },
    backTab: "organizations",
    editHref: `/settings?tab=organizations&edit=${o.id}`,
    summary: [
      { label: "Slug", value: o.slug },
      { label: "Users", value: String(o._count.users) },
      { label: "Teams", value: String(o._count.teams) },
      { label: "Roles", value: String(o._count.roles) },
      { label: "Added", value: formatDate(o.createdAt) },
      { label: "Updated", value: formatDate(o.updatedAt) },
    ],
    cards: [
      {
        title: "Teams",
        count: o.teams.length,
        emptyText: "No teams yet.",
        items: o.teams.map((t) => ({
          left: t.name,
          href: `/settings/team/${t.id}`,
          right: `${t._count.members} member${t._count.members === 1 ? "" : "s"}`,
        })),
      },
    ],
  };
}

async function getGlossaryDetail(id: string): Promise<AdminEntityDetail | null> {
  const db = await getScopedPrisma();
  const g = await db.customGlossaryTerm.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      term: true,
      label: true,
      category: true,
      definition: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { fullName: true } },
    },
  });
  if (!g || g.deletedAt) return null;

  return {
    kind: "glossary",
    name: g.term,
    displayId: formatGlossaryDisplayId(g),
    status: { label: g.category, tone: "indigo" },
    backTab: "glossary",
    editHref: `/settings?tab=glossary&edit=${g.id}`,
    summary: [
      { label: "Term", value: g.term },
      { label: "Label", value: g.label },
      { label: "Category", value: g.category },
      { label: "Definition", value: g.definition, wide: true },
      {
        label: "Added by",
        value: `${g.createdBy?.fullName ?? "—"} · ${formatDate(g.createdAt)}`,
      },
      { label: "Updated", value: formatDate(g.updatedAt) },
    ],
    cards: [],
  };
}
