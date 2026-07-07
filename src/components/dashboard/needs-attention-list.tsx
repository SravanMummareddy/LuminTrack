"use client";

import { useState } from "react";
import Link from "next/link";

type Item = { href: string; primary: string; secondary: string };

/** Rows shown before "See all" is clicked. */
const COLLAPSED = 3;
/** Once expanded, paginate when the list is longer than this. */
const PAGE_SIZE = 10;

/**
 * A "Needs attention" sub-list. Collapsed to a few rows by default with a
 * "See all" toggle; once expanded, a long list (> PAGE_SIZE) paginates instead
 * of running down the whole card. Optional `footer` links to the full page.
 */
export function MyWorkList({
  heading,
  empty,
  items,
  footer,
}: {
  heading: string;
  empty: string;
  items: Item[];
  footer?: { href: string; label: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);

  const paginated = expanded && items.length > PAGE_SIZE;
  const totalPages = Math.ceil(items.length / PAGE_SIZE);

  let shown: Item[];
  if (!expanded) shown = items.slice(0, COLLAPSED);
  else if (paginated) shown = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  else shown = items;

  const canExpand = items.length > COLLAPSED;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {heading}
      </h3>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
          {empty}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {shown.map((it, i) => (
              <li key={i}>
                <Link
                  href={it.href}
                  className="block px-3 py-2 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]"
                >
                  <span className="block truncate text-sm text-slate-800">
                    {it.primary}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {it.secondary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {(canExpand || footer) && (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              {paginated ? (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="tabular-nums">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-3">
                {canExpand && (
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded((e) => !e);
                      setPage(0);
                    }}
                    className="text-indigo-600 hover:underline"
                  >
                    {expanded ? "See less" : `See all ${items.length}`}
                  </button>
                )}
                {footer && (
                  <Link href={footer.href} className="text-indigo-600 hover:underline">
                    {footer.label}
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
