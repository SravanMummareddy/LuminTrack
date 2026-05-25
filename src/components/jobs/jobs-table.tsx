"use client";

import Link from "next/link";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import { JOB_STATUS_LABEL, JOB_STATUS_TONE, jobSourceLabel } from "@/lib/labels";
import { formatDate, formatJobDisplayId } from "@/lib/format";
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
  /** Receives the row and its 1-based page-offset row number. */
  render: (job: JobListRow, rowNumber: number) => React.ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "sno",
    label: "S.No",
    align: "right",
    defaultVisible: true,
    render: (_job, n) => (
      <Td label="S.No" secondary className="text-right tabular-nums">
        {n}
      </Td>
    ),
  },
  {
    key: "jobId",
    label: "Job ID",
    defaultVisible: true,
    render: (job) => (
      <Td label="Job ID" secondary className="whitespace-nowrap font-mono text-xs">
        {formatJobDisplayId(job)}
      </Td>
    ),
  },
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
// Bumped to 2 in Phase 7 — added sno + jobId columns. Saved prefs reset once.
const STORAGE_VERSION = 2;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function JobsTable({
  rows,
  pageOffset = 0,
}: {
  rows: JobListRow[];
  /** Row count preceding the first row on this page (e.g. (page-1)*pageSize). */
  pageOffset?: number;
}) {
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
          columns={orderedCols.map((c) => ({ key: c.key, label: c.label }))}
          prefs={prefs}
          onChange={setPrefs}
          defaults={DEFAULTS}
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
          {rows.map((job, idx) => (
            <tr key={job.id} className="hover:bg-slate-50">
              {visibleCols.map((c) => (
                <RenderCell
                  key={c.key}
                  column={c}
                  job={job}
                  rowNumber={pageOffset + idx + 1}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/** Wrapper so we can key by column without making each render function key-aware. */
function RenderCell({
  column,
  job,
  rowNumber,
}: {
  column: Column;
  job: JobListRow;
  rowNumber: number;
}) {
  return <>{column.render(job, rowNumber)}</>;
}

