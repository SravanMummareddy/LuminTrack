"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Table } from "@/components/ui/table";

/**
 * Wraps a Reports dimension table so only the top N rows render by default,
 * with a "Show all N" toggle to expand. Rows are pre-rendered on the server
 * and passed as ReactNode[] so this Client Component never has to receive a
 * function prop (which would break the RSC boundary).
 */
export function CollapsibleTable({
  rows,
  defaultLimit = 10,
  head,
  emptyState,
}: {
  rows: React.ReactNode[];
  defaultLimit?: number;
  /** The header row(s) only — a bare `<tr>`. This component supplies the `<thead>`. */
  head: React.ReactNode;
  emptyState?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return (
      <>
        {emptyState ?? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No data for the selected filters.
          </p>
        )}
      </>
    );
  }

  const collapsible = rows.length > defaultLimit;
  const visible = !collapsible || expanded ? rows : rows.slice(0, defaultLimit);

  return (
    <div className="space-y-2">
      <Table>
        <thead className="border-b border-slate-200 bg-slate-50">{head}</thead>
        <tbody className="divide-y divide-slate-100">{visible}</tbody>
      </Table>

      {collapsible && (
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Showing{" "}
            <span className="font-medium text-slate-700">{visible.length}</span>{" "}
            of <span className="font-medium text-slate-700">{rows.length}</span>
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
          >
            {expanded ? (
              <>
                Show top {defaultLimit}
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Show all {rows.length}
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
