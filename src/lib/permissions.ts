// Permissions seam.
//
// Every "can this user do the privileged thing?" question routes through `can()`
// (or a named predicate that shims over it) rather than inlining `role === "…"`
// at call sites, so the policy lives in one place.
//
// RBAC model (Phase B): permissions are a fixed vocabulary in code
// (`permission-catalog.ts`); roles are data an admin composes (Role /
// RolePermission tables). `can(viewer, key)` is the single authz check. A viewer
// carries a hydrated `permissions` set (loaded in `getCurrentUser` from its
// role) — but when a caller only has an enum `role` (synthetic `{ role }`
// viewers, or a user loaded before permissions were hydrated), `can()` falls
// back to the role→template map, so behavior is identical either way.
//
// The named predicates below are kept as one-line shims so the ~90 call sites
// that use them don't change. Two coarse tiers remain, now expressed as
// permission keys:
//   - `hasFullAccess`  → `tier:full`    (archive/erase, export, edit others' work)
//   - `isManagerTier`  → `tier:manager` (analytics, reports, recruiters, settings)

import type { DocumentCategory, UserRole } from "@/generated/prisma/enums";
import {
  permissionsForRole,
  type PermissionKey,
} from "@/lib/permission-catalog";

/** A viewer either carries a hydrated permission set (real, logged-in user) or
 *  just an enum role (synthetic checks / pre-hydration) — `can()` handles both. */
export type Viewer = {
  role?: UserRole | null;
  permissions?: ReadonlySet<string> | readonly string[] | null;
};

/** Human-facing role label. */
export const ROLE_LABEL: Record<UserRole, string> = {
  MANAGER: "Manager",
  TEAM_LEAD: "Team Lead",
  RECRUITER: "Recruiter",
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABEL[role];
}

/**
 * The single authorization check. `scope` is reserved for a future self/team/org
 * refinement; in v1 every permission is flat allow/deny and scope is ignored.
 */
export function can(
  viewer: Viewer | null | undefined,
  key: PermissionKey,
  _scope?: "self" | "team" | "org",
): boolean {
  if (!viewer) return false;
  const perms = viewer.permissions
    ? viewer.permissions instanceof Set
      ? viewer.permissions
      : new Set(viewer.permissions)
    : permissionsForRole(viewer.role);
  return perms.has(key);
}

/**
 * The privileged tier: archive/erase, export, and editing work that isn't your
 * own. Historically Manager || Team Lead; now the `tier:full` permission.
 */
export function hasFullAccess(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "tier:full");
}

/**
 * The Manager tier: the nav / financial / analytics boundary (Dashboard
 * analytics, Reports, Recruiters, Settings, audit). The `tier:manager` permission.
 */
export function isManagerTier(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "tier:manager");
}

/** May *create* a client/vendor inline (quick-add) while working, but not curate them. */
export function canQuickAddOrgEntities(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "orgentity:quickadd");
}

const SENSITIVE: ReadonlySet<DocumentCategory> = new Set<DocumentCategory>([
  "IDENTITY",
  "WORK_AUTH",
]);

export function isSensitiveCategory(category: DocumentCategory): boolean {
  return SENSITIVE.has(category);
}

export function canViewSensitiveDocs(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "document:view_sensitive");
}

export function canManageSensitiveDocs(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "document:manage_sensitive");
}

export function canViewBenchCredentials(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "bench:view_credentials");
}

// Vendor Portal Requirements — the pre-submission planning layer.
export function canManageRequirements(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "requirement:manage");
}

// Org-entity curation + user administration + export + audit — Settings-only.
export function canManageOrgEntities(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "orgentity:manage");
}

export function canManageUsers(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "user:manage");
}

// Job commercial fields (client/vendor rates) and recruiter assignment.
export function canEditJobRatesAndAssignment(
  viewer: Viewer | null | undefined,
): boolean {
  return can(viewer, "job:edit_rates");
}

// Re-attributing a submission to a different recruiter ("Submitted by").
export function canReattributeSubmission(
  viewer: Viewer | null | undefined,
): boolean {
  return can(viewer, "submission:reattribute");
}

// Financial visibility — pay/bill rates and margin (placements + analytics).
export function canViewFinancials(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "financials:view");
}

// Governance: promote to Manager / edit a Manager's account.
export function canGrantManagerRole(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "user:grant_manager");
}

// Manage the roles/permissions themselves (Settings → Roles).
export function canManageRoles(viewer: Viewer | null | undefined): boolean {
  return can(viewer, "role:manage");
}
