/**
 * Learned free-text dropdowns. A curated default list per category is unioned
 * with values users have typed before (persisted in the `LookupOption` table),
 * so a new value reappears in the dropdown next time. Categories:
 *   WORK_AUTH     — work authorization (candidate / bench / job)
 *   WORKING_TYPE  — "working now" engagement type (candidate)
 *   CALL_TYPE     — bench call type
 *   PAYROLL_TYPE  — bench payroll type
 *   PROJECT_TYPE  — bench project type (nature / duration of the engagement)
 */
export const LOOKUP_CATEGORIES = [
  "WORK_AUTH",
  "WORKING_TYPE",
  "CALL_TYPE",
  "PAYROLL_TYPE",
  "PROJECT_TYPE",
] as const;

export type LookupCategory = (typeof LOOKUP_CATEGORIES)[number];

/** Curated starting values — common US work authorizations + engagement types.
 *  Users can still type anything unlisted; it gets remembered on save. */
export const LOOKUP_DEFAULTS: Record<LookupCategory, string[]> = {
  WORK_AUTH: [
    "US Citizen",
    "Green Card",
    "GC-EAD",
    "H-1B",
    "H-4 EAD",
    "L-2 EAD",
    "OPT (F-1)",
    "STEM OPT",
    "CPT",
    "TN",
    "E-3",
  ],
  WORKING_TYPE: ["C2C", "W2", "Full-time"],
  CALL_TYPE: ["C2C", "W2", "1099", "Any"],
  PAYROLL_TYPE: ["W2", "C2C", "1099"],
  PROJECT_TYPE: ["Contract", "Contract-to-Hire", "Full-time", "Part-time"],
};

/** Curated defaults first, then learned values (not already in defaults),
 *  deduped case-insensitively and sorted. */
export function mergeLookupValues(
  defaults: string[],
  learned: string[],
): string[] {
  const seen = new Set(defaults.map((d) => d.toLowerCase()));
  const extra = learned
    .filter((v) => !seen.has(v.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return [...defaults, ...extra];
}
