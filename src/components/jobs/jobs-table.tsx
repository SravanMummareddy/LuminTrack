"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  jobSourceLabel,
} from "@/lib/labels";
import { DisciplineBadge } from "@/components/ui/discipline-badge";
import { OrgEntityLink } from "@/components/settings/org-entity-link";
import { formatDate, formatJobDisplayId } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { JobListRow } from "@/server/queries/jobs";
import { JobBulkBar } from "@/components/jobs/job-bulk-bar";

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
  /** Receives the row, its 1-based page-offset row number, and whether the
   *  viewer is a manager (managers get linked org-entity names). */
  render: (job: JobListRow, rowNumber: number, isManager: boolean) => React.ReactNode;
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
        <Link href={`/jobs/${job.id}`} className="text-indigo-600 hover:underline">
          {formatJobDisplayId(job)}
        </Link>
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
    render: (job, _n, isManager) => (
      <Td label="Client">
        <OrgEntityLink
          kind="client"
          id={job.clientId}
          name={job.client.name}
          isManager={isManager}
        />
      </Td>
    ),
  },
  {
    key: "vendor",
    label: "Vendor",
    sortKey: "vendor",
    defaultVisible: true,
    render: (job, _n, isManager) => (
      <Td label="Vendor" secondary>
        <OrgEntityLink
          kind="vendor"
          id={job.vendorId}
          name={job.vendor.name}
          isManager={isManager}
        />
      </Td>
    ),
  },
  {
    key: "source",
    label: "Source",
    sortKey: "source",
    defaultVisible: true,
    render: (job, _n, isManager) => {
      if (job.sourceType === "SISTER_COMPANY" && job.sisterCompanySource)
        return (
          <Td label="Source" secondary>
            <OrgEntityLink
              kind="source"
              id={job.sisterCompanySourceId}
              name={job.sisterCompanySource.name}
              isManager={isManager}
            />
          </Td>
        );
      if (job.sourceType === "REFERRAL" && job.referrer)
        return (
          <Td label="Source" secondary>
            <OrgEntityLink
              kind="referrer"
              id={job.referrerId}
              name={job.referrer.name}
              isManager={isManager}
            />
          </Td>
        );
      return (
        <Td label="Source" secondary>
          {jobSourceLabel(job)}
        </Td>
      );
    },
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
    key: "discipline",
    label: "Discipline",
    sortKey: "discipline",
    defaultVisible: false,
    render: (job) => (
      <Td label="Discipline" secondary>
        <DisciplineBadge discipline={job.discipline} />
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
  // ─── Extra job-detail columns (hidden by default) ─────────────────────────
  {
    key: "startDate",
    label: "Projected start",
    sortKey: "startDate",
    defaultVisible: false,
    render: (job) => (
      <Td label="Projected start" secondary className="whitespace-nowrap">
        {job.startDate ? formatDate(job.startDate) : "—"}
      </Td>
    ),
  },
  {
    key: "positions",
    label: "Positions",
    sortKey: "positions",
    align: "right",
    defaultVisible: false,
    render: (job) => (
      <Td label="Positions" secondary className="text-right tabular-nums">
        {job.positions ?? "—"}
      </Td>
    ),
  },
  {
    key: "updated",
    label: "Updated",
    sortKey: "updated",
    sortDefaultDir: "desc",
    defaultVisible: false,
    render: (job) => (
      <Td label="Updated" secondary className="whitespace-nowrap">
        {formatDate(job.updatedAt)}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.jobs.columns";
// Bumped to 4 — removed the iLabor import columns from the registry.
const STORAGE_VERSION = 4;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function JobsTable({
  rows,
  isManager,
  pageOffset = 0,
  countLabel,
  storageKey = STORAGE_KEY,
  columnDefaults = DEFAULTS,
}: {
  rows: JobListRow[];
  /** Managers get linked Client/Vendor/Source names → org-entity detail pages. */
  isManager: boolean;
  /** Row count preceding the first row on this page (e.g. (page-1)*pageSize). */
  pageOffset?: number;
  /** e.g. "53 jobs" — shown before the column count. */
  countLabel?: string;
  /** Override the localStorage key so a different view (e.g. /vendor-portal)
   *  keeps its own independent column preferences. */
  storageKey?: string;
  /** Override which columns are visible/ordered by default for this view. */
  columnDefaults?: ColumnPrefs;
}) {
  const [prefs, setPrefs] = useColumnPrefs(
    storageKey,
    STORAGE_VERSION,
    columnDefaults,
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pageIds = rows.map((r) => r.id);
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(pageIds));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const checkboxClass =
    "h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200";

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
            : `${countLabel ? `${countLabel} · ` : ""}Showing ${visibleCols.length} of ${COLUMNS.length} columns`}
        </p>
        <ColumnsMenu
          columns={orderedCols.map((c) => ({ key: c.key, label: c.label }))}
          prefs={prefs}
          onChange={setPrefs}
          defaults={columnDefaults}
        />
      </div>

      {selected.size > 0 && (
        <JobBulkBar
          selectedIds={[...selected]}
          selectedStatuses={rows
            .filter((r) => selected.has(r.id))
            .map((r) => r.status)}
          onDone={() => setSelected(new Set())}
        />
      )}

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
            <Th className="w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all on this page"
                className={checkboxClass}
              />
            </Th>
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
            <tr
              key={job.id}
              className={selected.has(job.id) ? "bg-indigo-50/60" : "hover:bg-slate-50"}
            >
              <td className="w-8 px-3 align-middle">
                <input
                  type="checkbox"
                  checked={selected.has(job.id)}
                  onChange={() => toggleOne(job.id)}
                  aria-label={`Select ${job.title}`}
                  className={checkboxClass}
                />
              </td>
              {visibleCols.map((c) => (
                <RenderCell
                  key={c.key}
                  column={c}
                  job={job}
                  rowNumber={pageOffset + idx + 1}
                  isManager={isManager}
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
  isManager,
}: {
  column: Column;
  job: JobListRow;
  rowNumber: number;
  isManager: boolean;
}) {
  return <>{column.render(job, rowNumber, isManager)}</>;
}

