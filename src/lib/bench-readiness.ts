/**
 * The required-field labels a bench candidate is still missing before they're
 * "submission-ready". Empty array = ready. Single source of truth shared by the
 * bench roster flag ("Needs details") and the submission soft-block gate.
 *
 * `totalExperienceYears` is typed `unknown` so a Prisma Decimal, a number, or
 * null all work with the presence-only (`== null`) check — no Decimal import,
 * no flatten needed at the call site.
 */
export type CandidateDetailFields = {
  hasResume: boolean;
  totalExperienceYears: unknown;
  technology: string | null;
  workAuthorization: string | null;
  currentLocation: string | null;
};

const filled = (s: string | null) => typeof s === "string" && s.trim() !== "";

export function missingCandidateDetails(c: CandidateDetailFields): string[] {
  const missing: string[] = [];
  if (!c.hasResume) missing.push("résumé");
  if (c.totalExperienceYears == null) missing.push("experience");
  if (!filled(c.technology)) missing.push("technology");
  if (!filled(c.workAuthorization)) missing.push("visa");
  if (!filled(c.currentLocation)) missing.push("location");
  return missing;
}
