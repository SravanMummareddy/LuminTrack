// Permissions seam.
//
// Roles (see `UserRole`): MANAGER and TEAM_LEAD both have full access; RECRUITER
// is the limited day-to-day role. Every "can this user do the privileged thing?"
// question routes through a helper here rather than inlining `role === "…"` at
// call sites, so the policy can evolve in one place.
//
// Today's policy:
//   • Manager / Team Lead  → full access (org entities, users, exports, audit,
//     sensitive docs, bench credentials, job rates + recruiter assignment, VPR
//     management, submission re-attribution, placement rate edits).
//   • Recruiter            → create jobs, edit basic job fields + status, submit
//     candidates, manage their own work. NOT: job rates, recruiter assignment,
//     org/user admin, exports, audit, sensitive docs.
// (Recruiter job-edit policy is intentionally loose — "we can always change it".)

import type { DocumentCategory, UserRole } from "@/generated/prisma/enums";

type Viewer = { role: UserRole };

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
 * The privileged tier: Manager or Team Lead. This is the successor to the old
 * `role === "ADMIN"` check — both top roles are treated identically for now.
 */
export function hasFullAccess(viewer: Viewer | null | undefined): boolean {
  return viewer?.role === "MANAGER" || viewer?.role === "TEAM_LEAD";
}

const SENSITIVE: ReadonlySet<DocumentCategory> = new Set<DocumentCategory>([
  "IDENTITY",
  "WORK_AUTH",
]);

export function isSensitiveCategory(category: DocumentCategory): boolean {
  return SENSITIVE.has(category);
}

export function canViewSensitiveDocs(viewer: Viewer | null | undefined): boolean {
  return hasFullAccess(viewer);
}

export function canManageSensitiveDocs(viewer: Viewer | null | undefined): boolean {
  return hasFullAccess(viewer);
}

// Bench-Sales — the marketing email/password stored on a BenchConsultant are
// shared portal credentials. Any signed-in recruiter may need them to reach out
// to or market a consultant (owner decision 2026-07-08), so all authenticated
// users can view/edit them. Still detail-page only — never a list column or
// export.
export function canViewBenchCredentials(viewer: Viewer | null | undefined): boolean {
  return Boolean(viewer?.role);
}

// Vendor Portal Requirements — the pre-submission planning layer. Managers and
// team leads decide the commercial terms (create/edit/cancel/close); recruiters
// convert them into submissions.
export function canManageRequirements(viewer: Viewer | null | undefined): boolean {
  return hasFullAccess(viewer);
}

// Org entities (clients, vendors, sources) + user administration + data export
// + the audit log + iLabor import — all privileged.
export function canManageOrgEntities(viewer: Viewer | null | undefined): boolean {
  return hasFullAccess(viewer);
}

export function canManageUsers(viewer: Viewer | null | undefined): boolean {
  return hasFullAccess(viewer);
}

// Job commercial fields (client/vendor rates) and recruiter assignment on the
// job-edit form. Recruiters may edit basic job details + status but not these.
export function canEditJobRatesAndAssignment(
  viewer: Viewer | null | undefined,
): boolean {
  return hasFullAccess(viewer);
}

// Re-attributing a submission to a different recruiter ("Submitted by").
export function canReattributeSubmission(
  viewer: Viewer | null | undefined,
): boolean {
  return hasFullAccess(viewer);
}
