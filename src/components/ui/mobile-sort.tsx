"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { controlClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { SortDir } from "@/lib/filters";

export type MobileSortOption = {
  column: string;
  label: string;
  defaultDir?: SortDir;
};

/**
 * Mobile-only sort control. The clickable `<SortableHeader>` cells live in the
 * table head, which is hidden when the table collapses into cards on mobile —
 * this select/toggle pair drives the same `?sort=&dir=` params instead.
 */
export function MobileSort({ options }: { options: MobileSortOption[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const activeSort = params.get("sort") ?? "";
  const activeDir: SortDir = params.get("dir") === "desc" ? "desc" : "asc";

  function apply(sort: string, dir: SortDir) {
    const next = new URLSearchParams(params.toString());
    if (sort) {
      next.set("sort", sort);
      next.set("dir", dir);
    } else {
      next.delete("sort");
      next.delete("dir");
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2 md:hidden">
      <label htmlFor="mobile-sort" className="shrink-0 text-xs font-medium text-slate-500">
        Sort by
      </label>
      <select
        id="mobile-sort"
        value={activeSort}
        onChange={(e) => {
          const picked = options.find((o) => o.column === e.target.value);
          apply(e.target.value, picked?.defaultDir ?? "asc");
        }}
        className={cn(controlClass, "bg-white py-1.5")}
      >
        <option value="">Default</option>
        {options.map((o) => (
          <option key={o.column} value={o.column}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => apply(activeSort, activeDir === "asc" ? "desc" : "asc")}
        disabled={!activeSort}
        aria-label={activeDir === "asc" ? "Sort ascending" : "Sort descending"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
      >
        {activeDir === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
