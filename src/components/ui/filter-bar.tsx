"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";

/** One active-filter chip; `keys` are the search params dropped when removed. */
export type FilterChip = { keys: string[]; label: string };

/** Optional polished search box rendered at the head of the bar. */
export type SearchConfig = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
};

/**
 * Shared filter-bar shell for every list / analytics page. A search-forward
 * primary row (optional `search` box + caller `primary` fields) stays visible;
 * the rest (`advanced`) tucks behind a "Filters" disclosure with an active-count
 * badge. Stays a plain GET `<form>`, so advanced fields are kept mounted (just
 * hidden) and still submit. Active filters are echoed as removable chips below.
 */
export function FilterBar({
  basePath,
  search,
  primary,
  advanced,
  advancedActiveCount,
  chips,
}: {
  basePath: string;
  search?: SearchConfig;
  primary: React.ReactNode;
  advanced: React.ReactNode;
  advancedActiveCount: number;
  chips: FilterChip[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(advancedActiveCount > 0);

  // Preserve the active sort when filters are re-applied.
  const sort = params.get("sort");
  const dir = params.get("dir");

  // Removing a chip drops its param(s) and resets paging.
  const removeChipHref = (keys: string[]) => {
    const next = new URLSearchParams(params.toString());
    for (const key of keys) next.delete(key);
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="space-y-2">
      <form
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        suppressHydrationWarning
      >
        {sort && <input type="hidden" name="sort" value={sort} />}
        {dir && <input type="hidden" name="dir" value={dir} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {search && (
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name={search.name}
                defaultValue={search.defaultValue ?? ""}
                placeholder={search.placeholder ?? "Search…"}
                suppressHydrationWarning
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          )}

          {primary}

          <div className="flex items-center gap-2 sm:ml-auto">
            <button type="submit" className={buttonClass("primary", "sm")}>
              <Search className="h-4 w-4" />
              Apply
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cn(
                buttonClass("secondary", "sm"),
                open && "border-indigo-300 bg-indigo-50 text-indigo-700",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {advancedActiveCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                  {advancedActiveCount}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
            <Link href={basePath} className={buttonClass("ghost", "sm")}>
              Clear
            </Link>
          </div>
        </div>

        {/* Advanced fields stay mounted so they always submit; only hidden. */}
        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4",
            open ? "mt-3 border-t border-slate-100 pt-3" : "hidden",
          )}
        >
          {advanced}
        </div>
      </form>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-xs text-slate-400">Active:</span>
          {chips.map((chip) => (
            <Link
              key={chip.keys.join(",")}
              href={removeChipHref(chip.keys)}
              scroll={false}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 transition hover:border-indigo-200 hover:bg-indigo-100"
            >
              {chip.label}
              <X className="h-3 w-3 text-indigo-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
