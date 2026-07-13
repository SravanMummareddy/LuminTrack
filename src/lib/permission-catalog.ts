// The permission catalog — the FIXED vocabulary of privileged capabilities.
//
// Permissions are code (this file); roles are data (the Role/RolePermission
// tables an admin composes). This is the "add roles, not permission types"
// model: the set of keys here only changes with a deploy; which role grants
// which key is edited live in Settings → Roles.
//
// Scope note (v1): permissions are flat allow/deny. `can(viewer, key)` takes an
// optional scope arg for forward-compatibility, but no permission is scoped yet
// — "whose records" stays implicit at the call site as it is today.
//
// Only genuinely GATED capabilities live here. Role-as-data-classification
// (PERFORMANCE_ROLES / who counts as a performer), cosmetic role tints, and the
// "auto-assign the recruiter who created it" identity rules are NOT permissions
// — they ride the `UserRole` enum, which we keep through this transition.

import type { UserRole } from "@/generated/prisma/enums";

export type PermissionCategory =
  | "tier"
  | "jobs"
  | "candidates"
  | "submissions"
  | "financials"
  | "administration";

export type PermissionKey =
  // Coarse tiers (the two broad gates used across many heterogeneous sites).
  | "tier:full" //     hasFullAccess — archive/erase, export, edit others' work
  | "tier:manager" //  isManagerTier — analytics, reports, recruiters, settings
  // Fine-grained capabilities (each had a named predicate today).
  | "requirement:manage"
  | "job:edit_rates"
  | "submission:reattribute"
  | "financials:view"
  | "document:view_sensitive"
  | "document:manage_sensitive"
  | "bench:view_credentials"
  | "orgentity:quickadd"
  | "orgentity:manage"
  | "user:manage"
  | "user:grant_manager"
  | "role:manage";

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  description: string;
  category: PermissionCategory;
};

/** The catalog, in display order (grouped by category in the admin UI). */
export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  {
    key: "tier:manager",
    label: "Analytics, reports & settings",
    description:
      "The manager tier: Dashboard analytics, Reports, Recruiters, the org chart, Settings, and the audit log.",
    category: "tier",
  },
  {
    key: "tier:full",
    label: "Full management access",
    description:
      "Archive/erase candidates & jobs, export data, and edit or bulk-act on work that isn't their own.",
    category: "tier",
  },
  {
    key: "job:edit_rates",
    label: "Edit job rates & assignment",
    description: "The commercial rate fields and recruiter assignment on a job.",
    category: "jobs",
  },
  {
    key: "requirement:manage",
    label: "Manage vendor requirements (VPR)",
    description: "Create, edit, cancel, and close Vendor Portal Requirements.",
    category: "jobs",
  },
  {
    key: "orgentity:quickadd",
    label: "Quick-add client / vendor",
    description: "Create a client or vendor inline while working (not curate them).",
    category: "jobs",
  },
  {
    key: "submission:reattribute",
    label: "Re-attribute submissions",
    description: 'Change a submission\'s "Submitted by" to another recruiter.',
    category: "submissions",
  },
  {
    key: "bench:view_credentials",
    label: "View bench credentials",
    description: "See the shared marketing portal email/password on a bench consultant.",
    category: "candidates",
  },
  {
    key: "document:view_sensitive",
    label: "View sensitive documents",
    description: "View identity and work-authorization documents.",
    category: "candidates",
  },
  {
    key: "document:manage_sensitive",
    label: "Manage sensitive documents",
    description: "Upload, replace, or delete identity and work-authorization documents.",
    category: "candidates",
  },
  {
    key: "financials:view",
    label: "View financials (rates & margin)",
    description: "See pay/bill rates and margin on placements and analytics.",
    category: "financials",
  },
  {
    key: "orgentity:manage",
    label: "Manage clients / vendors / sources",
    description: "Curate (rename, deactivate) org entities in Settings.",
    category: "administration",
  },
  {
    key: "user:manage",
    label: "Manage teams & users",
    description: "Create and edit users and teams.",
    category: "administration",
  },
  {
    key: "user:grant_manager",
    label: "Grant the Manager role",
    description:
      "Promote a user to Manager or edit an existing Manager's account (governance).",
    category: "administration",
  },
  {
    key: "role:manage",
    label: "Manage roles & permissions",
    description: "Create, edit, and assign roles in Settings → Roles.",
    category: "administration",
  },
];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map(
  (p) => p.key,
);

export const CATEGORY_LABEL: Record<PermissionCategory, string> = {
  tier: "Access tier",
  jobs: "Jobs & requirements",
  candidates: "Candidates & bench",
  submissions: "Submissions & pipeline",
  financials: "Financials",
  administration: "Org & administration",
};

// System-role grant templates — reproduce TODAY's behavior exactly so the seed
// and the enum→permission fallback are identical on day one. Editing a system
// role's permissions later happens in the DB (the template is only the default).
//
//   Recruiter  → the two "any signed-in user" capabilities only.
//   Team Lead  → recruiter + the hasFullAccess (tier:full) capability cluster.
//   Manager    → everything.
const RECRUITER_GRANTS: PermissionKey[] = [
  "orgentity:quickadd",
  "bench:view_credentials",
  // Recruiters create/edit their own VendorPortalRequirements (owner decision
  // 2026-07-13). VPRs are a separate table, invisible to submission analytics by
  // construction, so this doesn't affect any recruiter performance metric.
  "requirement:manage",
];

const TEAM_LEAD_GRANTS: PermissionKey[] = [
  ...RECRUITER_GRANTS,
  "tier:full",
  "job:edit_rates",
  "submission:reattribute",
  "financials:view",
  "document:view_sensitive",
  "document:manage_sensitive",
];

const MANAGER_GRANTS: PermissionKey[] = [...PERMISSION_KEYS];

export const SYSTEM_ROLE_GRANTS: Record<UserRole, PermissionKey[]> = {
  RECRUITER: RECRUITER_GRANTS,
  TEAM_LEAD: TEAM_LEAD_GRANTS,
  MANAGER: MANAGER_GRANTS,
};

/**
 * The enum tier a role maps to, derived from its permissions. Keeps the legacy
 * `UserRole` enum (still used by data-classification: PERFORMANCE_ROLES, badge
 * tints, recruiter/team-lead pickers) meaningful for a custom role — a role with
 * the manager tier reads as MANAGER, one with full access as TEAM_LEAD, else
 * RECRUITER. For the three system roles this reproduces their `systemRole`.
 */
export function deriveEnumTier(
  permissionKeys: Iterable<string>,
): UserRole {
  const s = new Set(permissionKeys);
  if (s.has("tier:manager")) return "MANAGER";
  if (s.has("tier:full")) return "TEAM_LEAD";
  return "RECRUITER";
}

/** The permission set for a base enum role (the fallback when a viewer has no
 *  DB-hydrated permission set — synthetic `{ role }` viewers, or pre-backfill). */
export function permissionsForRole(
  role: UserRole | null | undefined,
): ReadonlySet<PermissionKey> {
  if (!role) return EMPTY;
  return new Set(SYSTEM_ROLE_GRANTS[role]);
}

const EMPTY: ReadonlySet<PermissionKey> = new Set();

/** Metadata for seeding the three system roles (name/label/description). */
export const SYSTEM_ROLES: {
  role: UserRole;
  name: string;
  label: string;
  description: string;
}[] = [
  {
    role: "MANAGER",
    name: "Manager",
    label: "Manager",
    description: "Full access — analytics, financials, and settings.",
  },
  {
    role: "TEAM_LEAD",
    name: "Team Lead",
    label: "Team Lead",
    description: "Operational surface plus VPR, sensitive docs, and rates — no analytics.",
  },
  {
    role: "RECRUITER",
    name: "Recruiter",
    label: "Recruiter",
    description: "The operational surface — their own pipeline.",
  },
];
