import { twMerge } from "tailwind-merge";

/**
 * Joins class names, dropping falsy values, and resolves conflicting Tailwind
 * utilities so the LAST one wins — e.g. a caller's `text-amber-700` overrides a
 * component's baked-in `text-slate-700`.
 *
 * Before this used `tailwind-merge`, `cn` was a plain string join: both
 * conflicting classes stayed in the list and the CSS cascade (stylesheet emit
 * order), not the call site, decided the winner. That silently defeated passed
 * colours — the days-in-stage amber stale highlight and the reports
 * negative-margin red both rendered as the base slate instead. Merging makes
 * the call site authoritative, as every caller already assumed.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
