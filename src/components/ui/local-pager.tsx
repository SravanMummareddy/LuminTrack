"use client";

import { useState } from "react";

/**
 * Client-side pagination for in-memory lists (e.g. the Settings tables, which
 * filter locally rather than via URL params). Returns the current page slice
 * plus a ready-to-render `<LocalPager>` footer. The displayed page is derived
 * (clamped) from the list size, so when a filter shrinks the list the view
 * falls back into range without needing a state-resetting effect.
 */
export function useLocalPagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    page: safePage,
    setPage,
    pageItems,
    pager: (
      <LocalPager
        page={safePage}
        pageSize={pageSize}
        total={items.length}
        onPage={setPage}
      />
    ),
  };
}

export function LocalPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn =
    "rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex items-center justify-between pt-1 text-sm text-slate-500">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
        >
          Prev
        </button>
        <span className="text-slate-400">
          Page {page + 1} of {pageCount}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
