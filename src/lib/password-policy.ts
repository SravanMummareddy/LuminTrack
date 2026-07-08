/**
 * Password strength policy — "Balanced" (owner-chosen 2026-07-07): at least
 * PASSWORD_MIN_LENGTH characters and at least 3 of the 4 character classes
 * (lowercase, uppercase, digit, symbol). Symbols are encouraged but not
 * required, so it's meaningfully stronger than a bare length check without
 * forcing an awkward composition.
 *
 * Pure + framework-free so it's shared by the Zod schema (server enforcement)
 * and the live requirements checklist (client UX), and unit-tested directly.
 * Login is NOT subject to this — it checks the stored hash, not the policy.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MIN_CLASSES = 3;

export type PasswordClass = "lowercase" | "uppercase" | "number" | "symbol";

const CLASS_TESTS: Record<PasswordClass, RegExp> = {
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  number: /[0-9]/,
  // Anything that isn't a letter or a digit counts as a symbol (incl. spaces).
  symbol: /[^A-Za-z0-9]/,
};

/** The character classes present in `value`. */
export function passwordClasses(value: string): PasswordClass[] {
  return (Object.keys(CLASS_TESTS) as PasswordClass[]).filter((c) =>
    CLASS_TESTS[c].test(value),
  );
}

/** How many of the 4 character classes `value` contains. */
export function passwordClassCount(value: string): number {
  return passwordClasses(value).length;
}

/**
 * Human-readable policy failures for `value`, in display order. Empty array
 * means the password satisfies the policy. Used both to drive the Zod issues
 * and (indirectly) the checklist.
 */
export function passwordIssues(value: string): string[] {
  const issues: string[] = [];
  if (value.length < PASSWORD_MIN_LENGTH)
    issues.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  if (passwordClassCount(value) < PASSWORD_MIN_CLASSES)
    issues.push(
      `${PASSWORD_MIN_CLASSES} of: uppercase, lowercase, number, symbol`,
    );
  return issues;
}

/** Whether `value` satisfies the full policy. */
export function isStrongPassword(value: string): boolean {
  return passwordIssues(value).length === 0;
}

export type PasswordRequirement = { label: string; met: boolean };

/**
 * The requirement checklist for `value`, for the live UI. Each entry is a rule
 * plus whether the current value meets it.
 */
export function passwordRequirements(value: string): PasswordRequirement[] {
  return [
    {
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: value.length >= PASSWORD_MIN_LENGTH,
    },
    {
      label: `${PASSWORD_MIN_CLASSES} of: uppercase, lowercase, number, symbol (${passwordClassCount(
        value,
      )}/4)`,
      met: passwordClassCount(value) >= PASSWORD_MIN_CLASSES,
    },
  ];
}
