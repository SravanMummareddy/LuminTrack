import { format } from "date-fns";

export function formatDate(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

/** Formats a numeric rate (Prisma Decimal, number, or string) as USD per hour. */
export function formatRate(
  value: { toString(): string } | number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value.toString());
  if (Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}/hr`;
}

/** Formats a years-of-experience value (Prisma Decimal or number). */
export function formatExperience(
  value: { toString(): string } | number | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  return `${value.toString()} yrs`;
}
