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

// ─── Pagination & sorting ────────────────────────────────────────────────────

/** Rows per page across the paginated list views. */
export const PAGE_SIZE = 10;

export type SortDir = "asc" | "desc";

/** A validated column-sort selection for a list query. */
export type SortState = { key: string; dir: SortDir };

/** A page of list rows plus the total row count and the clamped page number. */
export type Paginated<T> = { rows: T[]; total: number; page: number };

/** Parses a `?page=` value into a 1-based page number (defaults to 1). */
export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Validates `?sort=` / `?dir=` against the columns a list supports. Falls back
 * to the page's default sort when the params are missing or unrecognised.
 */
export function parseSort(
  sortValue: string | undefined,
  dirValue: string | undefined,
  allowedKeys: readonly string[],
  fallback: SortState,
): SortState {
  if (!sortValue || !allowedKeys.includes(sortValue)) return fallback;
  return { key: sortValue, dir: dirValue === "asc" ? "asc" : "desc" };
}
