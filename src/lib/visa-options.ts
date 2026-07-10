import type { SuggestOption } from "@/components/ui/suggest-input";

/**
 * Curated US work-authorization / visa list for the candidate + bench visa
 * fields. Grouped and ordered by how often each shows up in US IT staffing
 * (Citizen / PR first, then employer-sponsored, then the EAD family…), so the
 * common values sit at the top. Researched against USCIS guidance.
 *
 * This list is intentionally NOT learned into a shared lookup — the suggestion
 * set stays canonical so the dropdown can't fill with near-duplicates
 * ("H1" / "H-1" / "h1b"). The field still accepts a free-typed value on the
 * record; it just won't be added to everyone's list.
 *
 * `note: "no work auth"` flags a status that generally can't legally work
 * (F-2 dependents) — advisory only, it never blocks a save. F-1 is deliberately
 * NOT flagged: with CPT/OPT it IS work-authorized, so a hard flag would cry wolf.
 */
export const VISA_OPTIONS: SuggestOption[] = [
  { value: "US Citizen", group: "Citizen / permanent resident" },
  { value: "Green Card", group: "Citizen / permanent resident" },

  { value: "H-1B", group: "Employer-sponsored" },
  { value: "TN", group: "Employer-sponsored" },
  { value: "E-3", group: "Employer-sponsored" },

  { value: "GC-EAD", group: "EAD-based (any employer)" },
  { value: "OPT (F-1)", group: "EAD-based (any employer)" },
  { value: "STEM OPT", group: "EAD-based (any employer)" },
  { value: "H-4 EAD", group: "EAD-based (any employer)" },
  { value: "L-2 EAD", group: "EAD-based (any employer)" },
  { value: "Asylum / Refugee EAD", group: "EAD-based (any employer)" },

  { value: "CPT", group: "Student" },
  { value: "F-1", group: "Student" },

  { value: "F-2", group: "No work authorization", note: "no work auth" },

  { value: "EAD (other)", group: "Other" },
  { value: "Other", group: "Other" },
];
