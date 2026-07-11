// Permissions seam.
//
// Every "can this user do the privileged thing?" question routes through a helper
// here rather than inlining `role === "…"` at call sites, so the policy lives in
// one place.
//
// There are now TWO distinct boundaries — don't conflate them:
//
//   1. NAV / FINANCIAL / ANALYTICS tier → `isManagerTier` (MANAGER only).
//      Gates the Dashboard analytics, Reports, Recruiters, Settings, audit, and
//      org-wide financials. Team Leads are OUTSIDE this tier (owner decision
//      2026-07-11: recruiters + team leads get the operational surface only).
//
//   2. MANAGEMENT tier → `hasFullAccess` (MANAGER || TEAM_LEAD). Gates the powers
//      a Team Lead legitimately keeps inside their own operational nav — chiefly
//      VPR management (Vendor Portal is in their nav). Also currently sensitive
//      docs and job-rate/assignment editing (the latter is financial-adjacent and
//      will move to `isManagerTier` once the rate-masking follow-up lands).
//
// Settings-only powers (org-entity curation, user admin) are Manager-only because
// Team Leads lose the Settings page. Recruiters/TL can still *quick-add* a client
// or vendor inline while working via `canQuickAddOrgEntities`.
//
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

/**
 * The Manager-only tier: the nav / financial / analytics boundary. Narrower than
 * `hasFullAccess` — Team Leads are excluded. Use this for Dashboard analytics,
 * Reports, Recruiters, Settings, audit, and org-wide financial visibility.
 */
export function isManagerTier(viewer: Viewer | null | undefined): boolean {
  return viewer?.role === "MANAGER";
}

/**
 * May *create* a client/vendor inline (quick-add) while working, but not curate
 * (rename/deactivate) them — that stays `canManageOrgEntities`. Any signed-in
 * user qualifies (owner decision 2026-07-11).
 */
export function canQuickAddOrgEntities(viewer: Viewer | null | undefined): boolean {
  return Boolean(viewer?.role);
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

// Org-entity curation (clients, vendors, sources) + user administration + data
// export + the audit log — all live behind Settings, so Manager-only. (Recruiters
// and team leads can still quick-add an entity inline — see `canQuickAddOrgEntities`.)
export function canManageOrgEntities(viewer: Viewer | null | undefined): boolean {
  return isManagerTier(viewer);
}

export function canManageUsers(viewer: Viewer | null | undefined): boolean {
  return isManagerTier(viewer);
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
