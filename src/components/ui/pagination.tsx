"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { PAGE_SIZE } from "@/lib/filters";

/** Page numbers to render, with "…" gaps for long ranges. */
function pageItems(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: (number | "gap")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push("gap");
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < totalPages - 1) items.push("gap");
  items.push(totalPages);
  return items;
}

/**
 * URL-driven pagination control. Builds each link from the current search
 * params so filters and sort are preserved while only `?page=` changes.
 * Renders nothing when everything fits on one page.
 */
export function Pagination({
  page,
  totalPages,
  total,
  paramKey = "page",
}: {
  page: number;
  totalPages: number;
  total: number;
  /**
   * URL search-param this paginator writes to. Defaults to "page". Set a
   * unique key (e.g. "subs", "ints") so multiple paginated sub-tables can
   * coexist on the same detail page without stomping each other.
   */
  paramKey?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [jumpValue, setJumpValue] = useState(String(page));

  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const next = new URLSearchParams(params.toString());
    next.set(paramKey, String(p));
    return `${pathname}?${next.toString()}`;
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  const cell =
    "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-sm transition";
  const idle =
    "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900";
  const off = "border-slate-200 bg-slate-50 text-slate-300";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{" "}
        <span className="font-medium text-slate-700">{total}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {totalPages > 7 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(jumpValue, 10);
              if (Number.isNaN(n)) {
                setJumpValue(String(page));
                return;
              }
              const clamped = Math.min(Math.max(1, n), totalPages);
              setJumpValue(String(clamped));
              if (clamped !== page) router.push(hrefFor(clamped), { scroll: false });
            }}
            className="flex items-center gap-1.5 text-xs text-slate-500"
          >
            <label htmlFor="page-jump" className="whitespace-nowrap">
              Go to
            </label>
            <input
              id="page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              className="h-8 w-16 rounded-md border border-slate-300 bg-white px-2 text-center text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label={`Go to page (1 to ${totalPages})`}
            />
            <span className="whitespace-nowrap text-slate-400">of {totalPages}</span>
          </form>
        ) : null}

        <div className="flex items-center gap-1">
        {page <= 1 ? (
          <span className={cn(cell, off)} aria-disabled="true">
            <ChevronLeft className="h-4 w-4" />
            Prev
          </span>
        ) : (
          <Link href={hrefFor(page - 1)} scroll={false} className={cn(cell, idle)}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Link>
        )}

        {pageItems(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-slate-400">
              …
            </span>
          ) : item === page ? (
            <span
              key={item}
              aria-current="page"
              className={cn(
                cell,
                "border-indigo-600 bg-indigo-600 font-medium text-white",
              )}
            >
              {item}
            </span>
          ) : (
            <Link
              key={item}
              href={hrefFor(item)}
              scroll={false}
              className={cn(cell, idle)}
            >
              {item}
            </Link>
          ),
        )}

        {page >= totalPages ? (
          <span className={cn(cell, off)} aria-disabled="true">
            Next
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <Link href={hrefFor(page + 1)} scroll={false} className={cn(cell, idle)}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
        </div>
      </div>
    </nav>
  );
}
