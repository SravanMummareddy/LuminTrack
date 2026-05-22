"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";

/** One active-filter chip; `keys` are the search params dropped when removed. */
export type FilterChip = { keys: string[]; label: string };

/**
 * Shared filter-bar shell for every list / analytics page. Keeps the essential
 * fields (`primary`) always visible and tucks the rest (`advanced`) behind a
 * "Filters" toggle with an active-count badge. Stays a plain GET `<form>`, so
 * the advanced fields are kept mounted (just hidden) and still submit. Active
 * filters are echoed as removable chips below the bar.
 */
export function FilterBar({
  basePath,
  primary,
  advanced,
  advancedActiveCount,
  chips,
}: {
  basePath: string;
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
      <form className="rounded-lg border border-slate-200 bg-white p-4">
        {sort && <input type="hidden" name="sort" value={sort} />}
        {dir && <input type="hidden" name="dir" value={dir} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            {primary}
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" className={buttonClass("primary", "sm")}>
              <Search className="h-4 w-4" />
              Apply
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={buttonClass("secondary", "sm")}
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
            open ? "mt-4 border-t border-slate-100 pt-4" : "hidden",
          )}
        >
          {advanced}
        </div>
      </form>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">Active:</span>
          {chips.map((chip) => (
            <Link
              key={chip.keys.join(",")}
              href={removeChipHref(chip.keys)}
              scroll={false}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              {chip.label}
              <X className="h-3 w-3 text-slate-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
