"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SortDir } from "@/lib/filters";

/**
 * A sortable table header cell. Drop-in replacement for `<Th>` on columns that
 * support ordering — clicking it sets `?sort=&dir=` in the URL (and clears
 * `?page=` so re-sorting returns to page 1). Plain `<Th>` stays for columns
 * that can't be sorted (array / many-relation columns).
 *
 * The URL param names are overridable (`sortParam`/`dirParam`/`resetParam`) so a
 * secondary/sub-table on a page that already owns `?sort` can keep its own
 * namespace (e.g. `rsort`/`rdir`, resetting its own `rsubs` page).
 */
export function SortableHeader({
  column,
  label,
  align = "left",
  defaultDir = "asc",
  sortParam = "sort",
  dirParam = "dir",
  resetParam = "page",
}: {
  column: string;
  label: string;
  align?: "left" | "right";
  defaultDir?: SortDir;
  sortParam?: string;
  dirParam?: string;
  resetParam?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const isActive = params.get(sortParam) === column;
  const currentDir: SortDir = params.get(dirParam) === "desc" ? "desc" : "asc";
  // Clicking the active column flips direction; an inactive column starts at
  // its natural direction (`defaultDir`).
  const nextDir: SortDir = isActive
    ? currentDir === "asc"
      ? "desc"
      : "asc"
    : defaultDir;

  const next = new URLSearchParams(params.toString());
  next.set(sortParam, column);
  next.set(dirParam, nextDir);
  next.delete(resetParam);
  const href = `${pathname}?${next.toString()}`;

  const Icon = !isActive
    ? ChevronsUpDown
    : currentDir === "asc"
      ? ChevronUp
      : ChevronDown;

  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <Link
        href={href}
        scroll={false}
        aria-label={`Sort by ${label}`}
        className={cn(
          "group inline-flex items-center gap-1 rounded transition-colors hover:text-slate-900",
          align === "right" && "flex-row-reverse",
          isActive && "text-slate-900",
        )}
      >
        {label}
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors",
            isActive
              ? "text-indigo-600"
              : "text-slate-400 group-hover:text-slate-500",
          )}
        />
      </Link>
    </th>
  );
}
