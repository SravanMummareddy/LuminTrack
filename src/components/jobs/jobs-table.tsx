"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { GripVertical, SlidersHorizontal } from "lucide-react";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABEL, JOB_STATUS_TONE, jobSourceLabel } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { JobListRow } from "@/server/queries/jobs";

/**
 * Column registry. Each column is independent — toggling visibility or
 * reordering changes only the rendering, not the data fetch (listJobs
 * already pulls every scalar; relation includes are cheap).
 *
 * `sortKey` (when present) wires the column header to ?sort= via SortableHeader.
 * Server-side sortable keys are defined in `JOB_SORTS` in queries/jobs.ts.
 */
type Column = {
  key: string;
  label: string;
  /** Server-side sort key, if this column is sortable. */
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (job: JobListRow) => React.ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "title",
    label: "Job title",
    sortKey: "title",
    defaultVisible: true,
    render: (job) => (
      <Td heading>
        <Link
          href={`/jobs/${job.id}`}
          className={`${cardLink} font-medium text-indigo-600 hover:underline`}
        >
          {job.title}
        </Link>
      </Td>
    ),
  },
  {
    key: "client",
    label: "Client",
    sortKey: "client",
    defaultVisible: true,
    render: (job) => <Td label="Client">{job.client.name}</Td>,
  },
  {
    key: "vendor",
    label: "Vendor",
    sortKey: "vendor",
    defaultVisible: true,
    render: (job) => (
      <Td label="Vendor" secondary>
        {job.vendor.name}
      </Td>
    ),
  },
  {
    key: "source",
    label: "Source",
    sortKey: "source",
    defaultVisible: true,
    render: (job) => (
      <Td label="Source" secondary>
        {jobSourceLabel(job)}
      </Td>
    ),
  },
  {
    key: "location",
    label: "Location",
    sortKey: "location",
    defaultVisible: true,
    render: (job) => (
      <Td label="Location" secondary>
        {job.location || "—"}
      </Td>
    ),
  },
  {
    key: "recruiters",
    label: "Recruiters",
    defaultVisible: true,
    render: (job) => (
      <Td label="Recruiters" secondary>
        {job.assignments.length
          ? job.assignments.map((a) => a.recruiter.fullName).join(", ")
          : "—"}
      </Td>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortKey: "status",
    defaultVisible: true,
    render: (job) => (
      <Td label="Status">
        <Badge tone={JOB_STATUS_TONE[job.status]}>
          {JOB_STATUS_LABEL[job.status]}
        </Badge>
      </Td>
    ),
  },
  {
    key: "subs",
    label: "Subs",
    sortKey: "subs",
    sortDefaultDir: "desc",
    align: "right",
    defaultVisible: true,
    render: (job) => (
      <Td label="Subs" className="text-right tabular-nums">
        {job._count.submissions}
      </Td>
    ),
  },
  {
    key: "created",
    label: "Created",
    sortKey: "created",
    sortDefaultDir: "desc",
    defaultVisible: true,
    render: (job) => (
      <Td label="Created" secondary className="whitespace-nowrap">
        {formatDate(job.createdAt)}
      </Td>
    ),
  },
  // ─── iLabor / imported columns (hidden by default) ────────────────────────
  {
    key: "reqId",
    label: "Req ID",
    defaultVisible: false,
    render: (job) => (
      <Td label="Req ID" secondary className="tabular-nums">
        {job.portalRefId ?? "—"}
      </Td>
    ),
  },
  {
    key: "ilaborStatus",
    label: "iLabor status",
    defaultVisible: false,
    render: (job) => (
      <Td label="iLabor status" secondary>
        {job.externalStatusRaw ?? "—"}
      </Td>
    ),
  },
  {
    key: "startDate",
    label: "Projected start",
    defaultVisible: false,
    render: (job) => (
      <Td label="Projected start" secondary className="whitespace-nowrap">
        {job.startDate ? formatDate(job.startDate) : "—"}
      </Td>
    ),
  },
  {
    key: "lastImported",
    label: "Last imported",
    defaultVisible: false,
    render: (job) => (
      <Td label="Last imported" secondary className="whitespace-nowrap">
        {job.lastImportedAt ? formatDate(job.lastImportedAt) : "—"}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.jobs.columns";
const STORAGE_VERSION = 1;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function JobsTable({ rows }: { rows: JobListRow[] }) {
  const [prefs, setPrefs, hydrated] = useColumnPrefs(
    STORAGE_KEY,
    STORAGE_VERSION,
    DEFAULTS,
  );

  const byKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const orderedCols = prefs.order
    .map((k) => byKey.get(k))
    .filter((c): c is Column => Boolean(c));
  const visibleCols = orderedCols.filter((c) => prefs.visible.includes(c.key));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {rows.length === 0
            ? null
            : `Showing ${visibleCols.length} of ${COLUMNS.length} columns`}
        </p>
        <ColumnsMenu
          columns={orderedCols}
          prefs={prefs}
          onChange={setPrefs}
          disabled={!hydrated}
        />
      </div>

      <MobileSort
        options={visibleCols
          .filter((c) => c.sortKey)
          .map((c) => ({
            column: c.sortKey!,
            label: c.label,
            defaultDir: c.sortDefaultDir,
          }))}
      />

      <Table>
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {visibleCols.map((c) =>
              c.sortKey ? (
                <SortableHeader
                  key={c.key}
                  column={c.sortKey}
                  label={c.label}
                  align={c.align}
                  defaultDir={c.sortDefaultDir}
                />
              ) : (
                <Th key={c.key} className={c.align === "right" ? "text-right" : ""}>
                  {c.label}
                </Th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((job) => (
            <tr key={job.id} className="hover:bg-slate-50">
              {visibleCols.map((c) => (
                <RenderCell key={c.key} column={c} job={job} />
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/** Wrapper so we can key by column without making each render function key-aware. */
function RenderCell({ column, job }: { column: Column; job: JobListRow }) {
  return <>{column.render(job)}</>;
}

// ─── Columns menu (popover) ─────────────────────────────────────────────────

function ColumnsMenu({
  columns,
  prefs,
  onChange,
  disabled,
}: {
  columns: Column[];
  prefs: ColumnPrefs;
  onChange: (next: ColumnPrefs) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggleVisible(key: string) {
    const set = new Set(prefs.visible);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    // Preserve original column order in the `visible` array for determinism.
    const visible = prefs.order.filter((k) => set.has(k));
    onChange({ ...prefs, visible });
  }

  function moveTo(srcKey: string, dstKey: string) {
    if (srcKey === dstKey) return;
    const order = prefs.order.filter((k) => k !== srcKey);
    const dstIdx = order.indexOf(dstKey);
    order.splice(dstIdx, 0, srcKey);
    onChange({ ...prefs, order });
  }

  function reset() {
    onChange(DEFAULTS);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Columns
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1 py-1 text-xs text-slate-500">
            <span>Drag to reorder · toggle to show</span>
            <button
              type="button"
              onClick={reset}
              className="text-indigo-600 hover:underline"
            >
              Reset
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {columns.map((c) => {
              const isVisible = prefs.visible.includes(c.key);
              const isDragging = dragKey === c.key;
              return (
                <li
                  key={c.key}
                  draggable
                  onDragStart={() => setDragKey(c.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragKey) moveTo(dragKey, c.key);
                    setDragKey(null);
                  }}
                  onDragEnd={() => setDragKey(null)}
                  className={
                    "flex items-center gap-2 rounded px-1 py-1 text-sm " +
                    (isDragging ? "opacity-40" : "hover:bg-slate-50")
                  }
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab text-slate-400"
                    aria-hidden
                  />
                  <label className="flex flex-1 cursor-pointer items-center gap-2 select-none">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleVisible(c.key)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-700">{c.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
