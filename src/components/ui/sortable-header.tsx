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
 */
export function SortableHeader({
  column,
  label,
  align = "left",
  defaultDir = "asc",
}: {
  column: string;
  label: string;
  align?: "left" | "right";
  defaultDir?: SortDir;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const isActive = params.get("sort") === column;
  const currentDir: SortDir = params.get("dir") === "desc" ? "desc" : "asc";
  // Clicking the active column flips direction; an inactive column starts at
  // its natural direction (`defaultDir`).
  const nextDir: SortDir = isActive
    ? currentDir === "asc"
      ? "desc"
      : "asc"
    : defaultDir;

  const next = new URLSearchParams(params.toString());
  next.set("sort", column);
  next.set("dir", nextDir);
  next.delete("page");
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
