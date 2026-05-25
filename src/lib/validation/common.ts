import { z } from "zod";

/** Treats empty / whitespace-only strings as "not provided". */
export function emptyToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/** Optional free-text field — empty strings become undefined. */
export const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(5000).optional(),
);

/** Optional email — empty allowed, otherwise must be a valid address. */
export const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.email("Enter a valid email address.").optional(),
);

/** Optional URL — empty allowed, otherwise must be a valid URL. */
export const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.url("Enter a valid URL.").optional(),
);

/** Optional non-negative number — empty allowed, otherwise coerced from a string. */
export const optionalNonNegativeNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().nonnegative("Enter 0 or a positive number.").optional(),
);

/** Optional positive integer — empty allowed, otherwise coerced from a string. */
export const optionalPositiveInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1, "Enter 1 or more.").optional(),
);

/** Optional datetime — empty allowed, otherwise coerced from a datetime-local string. */
export const optionalDateTime = z.preprocess(
  emptyToUndefined,
  z.coerce.date().optional(),
);

/** Flattens a ZodError into a { fieldName: message } map for form display. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
