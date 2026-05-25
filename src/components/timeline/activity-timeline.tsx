"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { ActivityAction } from "@/generated/prisma/enums";
import {
  STATUS_CHANGE_REASON_LABEL,
  type StatusChangeReason,
} from "@/lib/labels";

type Entry = {
  id: string;
  action: ActivityAction;
  description: string;
  createdAt: Date | string;
  eventAt: Date | string | null;
  note: string | null;
  reason: string | null;
  performedBy: { fullName: string };
};

/** How many entries we show before requiring "Show all". */
const COLLAPSED_COUNT = 5;
/** When expanded, switch to a paged view past this size. */
const PAGE_THRESHOLD = 30;
/** Page size for the paged expanded view. */
const EXPANDED_PAGE_SIZE = 20;

/** Colours the timeline dot so milestone outcomes stand out at a glance. */
function dotClass(action: ActivityAction): string {
  if (
    action === "CANDIDATE_SELECTED" ||
    action === "OFFER_RELEASED" ||
    action === "CANDIDATE_JOINED"
  )
    return "bg-green-500";
  if (action === "CANDIDATE_REJECTED") return "bg-red-500";
  return "bg-indigo-500";
}

/**
 * Chronological audit timeline shown on the job / candidate / submission detail
 * pages. Entries come from `getTimelineFor()`, newest first.
 *
 * Default render shows only the most recent COLLAPSED_COUNT. "Show all"
 * expands inline; once expanded, very long timelines (> PAGE_THRESHOLD) flip
 * to a paged view with Prev/Next controls. Pagination state lives in this
 * component — NOT in URL params — because the timeline shares a page with
 * other paginated sub-tables that already use `?page=` style params.
 */
export function ActivityTimeline({ entries }: { entries: Entry[] }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);

  const total = entries.length;
  const paged = expanded && total > PAGE_THRESHOLD;
  const totalPages = paged ? Math.ceil(total / EXPANDED_PAGE_SIZE) : 1;
  const safePage = Math.min(Math.max(1, page), totalPages);

  const visible = !expanded
    ? entries.slice(0, COLLAPSED_COUNT)
    : paged
      ? entries.slice(
          (safePage - 1) * EXPANDED_PAGE_SIZE,
          safePage * EXPANDED_PAGE_SIZE,
        )
      : entries;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Activity timeline
      </h2>
      {total === 0 ? (
        <p className="text-sm text-slate-400">No activity recorded yet.</p>
      ) : (
        <>
          <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-200">
            {visible.map((entry) => (
              <li key={entry.id} className="relative pl-6">
                <span
                  className={cn(
                    "absolute left-0 top-1 h-[11px] w-[11px] rounded-full ring-4 ring-white",
                    dotClass(entry.action),
                  )}
                />
                <p className="text-sm text-slate-800">{entry.description}</p>
                {entry.reason && (
                  <p className="mt-1">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                      {STATUS_CHANGE_REASON_LABEL[
                        entry.reason as StatusChangeReason
                      ] ?? entry.reason}
                    </span>
                  </p>
                )}
                {entry.note && (
                  <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1 text-sm text-slate-600">
                    {entry.note}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-slate-400">
                  {entry.performedBy.fullName} ·{" "}
                  {entry.eventAt
                    ? `happened ${formatDateTime(entry.eventAt)} · recorded ${formatDateTime(entry.createdAt)}`
                    : formatDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ol>

          {total > COLLAPSED_COUNT && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setExpanded((v) => !v);
                  setPage(1);
                }}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                {expanded ? "Show fewer" : `Show all (${total})`}
              </button>

              {paged && (
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 px-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>
                  <span className="px-1 tabular-nums">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={safePage >= totalPages}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 px-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
