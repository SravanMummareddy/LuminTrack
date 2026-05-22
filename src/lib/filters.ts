import { startOfDay, endOfDay, subDays } from "date-fns";

export type DatePreset = "all" | "day" | "week" | "month" | "year" | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "day", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "year", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

/** A Prisma-compatible date filter ({} means no bounds). */
export type DateRange = { gte?: Date; lte?: Date };

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Turns URL search params into a date range usable in a Prisma `where` clause.
 * Presets are rolling windows ending now; "custom" uses explicit from/to.
 */
export function parseDateRange(params: {
  preset?: string;
  from?: string;
  to?: string;
}): DateRange {
  const now = new Date();

  switch (params.preset) {
    case "day":
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case "week":
      return { gte: startOfDay(subDays(now, 6)), lte: endOfDay(now) };
    case "month":
      return { gte: startOfDay(subDays(now, 29)), lte: endOfDay(now) };
    case "year":
      return { gte: startOfDay(subDays(now, 364)), lte: endOfDay(now) };
    case "custom": {
      const range: DateRange = {};
      const from = parseDate(params.from);
      const to = parseDate(params.to);
      if (from) range.gte = startOfDay(from);
      if (to) range.lte = endOfDay(to);
      return range;
    }
    default:
      return {};
  }
}
