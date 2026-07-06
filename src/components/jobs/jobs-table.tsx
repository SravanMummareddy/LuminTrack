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
import { JobRecruitersCell } from "@/components/jobs/job-recruiters-cell";

/**
 * Column registry. Each column is independent — toggling visibility or
 * reordering changes only the rendering, not the data fetch (listJobs
 * already pulls every scalar; relation includes are cheap).
 *
 * `sortKey` (when present) wires the column header to ?sort= via SortableHeader.
 * Server-side sortable keys are defined in `JOB_SORTS` in queries/jobs.ts.
 */
/** Cross-row context threaded into every cell render so columns can reach
 *  page-level data (current user, lookup lists) without prop-drilling each
 *  cell component through the table itself. */
type RenderCtx = {
  canEditRecruiters: boolean;
  allRecruiters: { id: string; fullName: string }[];
};

type Column = {
  key: string;
  label: string;
  /** Server-side sort key, if this column is sortable. */
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  /** Receives the row, its 1-based page-offset row number, and shared ctx. */
  render: (job: JobListRow, rowNumber: number, ctx: RenderCtx) => React.ReactNode;
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
    render: (job, _n, ctx) => (
      <JobRecruitersCell
        jobId={job.id}
        currentRecruiters={job.assignments.map((a) => ({
          id: a.recruiter.id,
          fullName: a.recruiter.fullName,
        }))}
        allRecruiters={ctx.allRecruiters}
        canEdit={ctx.canEditRecruiters}
      />
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
  // ─── Outcome tallies (hidden by default) — spec §9.2 ──────────────────────
  {
    key: "interviews",
    label: "Interviews",
    align: "right",
    defaultVisible: false,
    render: (job) => (
      <Td label="Interviews" secondary className="text-right tabular-nums">
        {job.interviewCount}
      </Td>
    ),
  },
  {
    key: "selected",
    label: "Selected",
    align: "right",
    defaultVisible: false,
    render: (job) => (
      <Td label="Selected" secondary className="text-right tabular-nums">
        {job.selectedCount}
      </Td>
    ),
  },
  {
    key: "joined",
    label: "Joined",
    align: "right",
    defaultVisible: false,
    render: (job) => (
      <Td label="Joined" secondary className="text-right tabular-nums">
        {job.joinedCount}
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
  // ─── Vendor-portal requirement columns (hidden by default on /jobs; the
  //     /vendor-portal view surfaces them via its own column preset) ──────────
  {
    key: "positions",
    label: "Positions",
    align: "right",
    defaultVisible: false,
    render: (job) => (
      <Td label="Positions" secondary className="text-right tabular-nums">
        {job.positions ?? "—"}
      </Td>
    ),
  },
  {
    key: "submitLimit",
    label: "Submit limit",
    align: "right",
    defaultVisible: false,
    render: (job) => (
      <Td label="Submit limit" secondary className="text-right tabular-nums">
        {job.submitLimit ?? "—"}
      </Td>
    ),
  },
  {
    key: "activeCount",
    label: "Active (iLabor)",
    align: "right",
    defaultVisible: false,
    render: (job) => (
      <Td label="Active (iLabor)" secondary className="text-right tabular-nums">
        {job.externalActiveCount ?? "—"}
      </Td>
    ),
  },
  {
    key: "released",
    label: "Released",
    defaultVisible: false,
    render: (job) => (
      <Td label="Released" secondary className="whitespace-nowrap">
        {job.releasedDate ? formatDate(job.releasedDate) : "—"}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.jobs.columns";
// Bumped to 3 — added the vendor-portal requirement columns to the registry.
const STORAGE_VERSION = 3;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function JobsTable({
  rows,
  pageOffset = 0,
  canEditRecruiters = false,
  allRecruiters = [],
  storageKey = STORAGE_KEY,
  columnDefaults = DEFAULTS,
}: {
  rows: JobListRow[];
  /** Row count preceding the first row on this page (e.g. (page-1)*pageSize). */
  pageOffset?: number;
  /** True when the current user can change recruiter assignments inline. */
  canEditRecruiters?: boolean;
  /** Full set of active recruiters available for inline assignment. */
  allRecruiters?: { id: string; fullName: string }[];
  /** Override the localStorage key so a different view (e.g. /vendor-portal)
   *  keeps its own independent column preferences. */
  storageKey?: string;
  /** Override which columns are visible/ordered by default for this view. */
  columnDefaults?: ColumnPrefs;
}) {
  const ctx: RenderCtx = { canEditRecruiters, allRecruiters };
  const [prefs, setPrefs] = useColumnPrefs(
    storageKey,
    STORAGE_VERSION,
    columnDefaults,
  );

  const byKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const orderedCols = prefs.order
    .map((k) => byKey.get(k))
    .filter((c): c is Column => Boolean(c));
  const visibleCols = orderedCols.filter((c) => prefs.visible.includes(c.key));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500" suppressHydrationWarning>
          {rows.length === 0
            ? null
            : `Showing ${visibleCols.length} of ${COLUMNS.length} columns`}
        </p>
        <ColumnsMenu
          columns={orderedCols.map((c) => ({ key: c.key, label: c.label }))}
          prefs={prefs}
          onChange={setPrefs}
          defaults={columnDefaults}
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
                  ctx={ctx}
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
  ctx,
}: {
  column: Column;
  job: JobListRow;
  rowNumber: number;
  ctx: RenderCtx;
}) {
  return <>{column.render(job, rowNumber, ctx)}</>;
}

