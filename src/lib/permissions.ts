// Permissions seam (R4.1).
//
// Today's policy is intentionally tiny: admins can see sensitive document
// categories (Identity, Work Auth); everyone else can't. That's the entire
// rule set. We deliberately did NOT inline `user.role === "ADMIN"` checks at
// every call site — they now route through these helpers so the future
// granular IAM (per-candidate ACLs, finance/lead-recruiter roles, per-doc
// overrides — see ENHANCEMENTS.md "Granular IAM") can grow here without
// touching every server action and page.
//
// When you add a new role / scope: extend the helpers, keep the call sites
// the same. If a check needs more context (e.g. "can this recruiter see this
// candidate?"), add a new helper rather than passing the user object around.

import type { DocumentCategory, UserRole } from "@/generated/prisma/enums";

type Viewer = { role: UserRole };

const SENSITIVE: ReadonlySet<DocumentCategory> = new Set<DocumentCategory>([
  "IDENTITY",
  "WORK_AUTH",
]);

export function isSensitiveCategory(category: DocumentCategory): boolean {
  return SENSITIVE.has(category);
}

export function canViewSensitiveDocs(viewer: Viewer | null | undefined): boolean {
  return viewer?.role === "ADMIN";
}

export function canManageSensitiveDocs(viewer: Viewer | null | undefined): boolean {
  return viewer?.role === "ADMIN";
}
