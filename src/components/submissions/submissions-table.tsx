"use client";

import Link from "next/link";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
} from "@/lib/labels";
import { formatDate, formatSubmissionDisplayId } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { SubmissionListRow } from "@/server/queries/submissions";

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (row: SubmissionListRow, rowNumber: number) => React.ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "sno",
    label: "S.No",
    align: "right",
    defaultVisible: true,
    render: (_r, n) => (
      <Td label="S.No" secondary className="text-right tabular-nums">
        {n}
      </Td>
    ),
  },
  {
    key: "id",
    label: "ID",
    defaultVisible: true,
    render: (s) => (
      <Td label="ID" secondary className="whitespace-nowrap font-mono text-xs">
        {formatSubmissionDisplayId(s)}
      </Td>
    ),
  },
  {
    key: "candidate",
    label: "Candidate",
    sortKey: "candidate",
    defaultVisible: true,
    render: (s) => (
      <Td heading>
        <Link
          href={`/submissions/${s.id}`}
          className={`${cardLink} font-medium text-indigo-600 hover:underline`}
        >
          {s.candidate.fullName}
        </Link>
      </Td>
    ),
  },
  {
    key: "job",
    label: "Job",
    sortKey: "job",
    defaultVisible: true,
    render: (s) => (
      <Td label="Job">
        <Link
          href={`/jobs/${s.job.id}`}
          className="text-slate-700 hover:underline"
        >
          {s.job.title}
        </Link>
      </Td>
    ),
  },
  {
    key: "client",
    label: "Client",
    sortKey: "client",
    defaultVisible: true,
    render: (s) => (
      <Td label="Client" secondary>
        {s.job.client.name}
      </Td>
    ),
  },
  {
    key: "vendor",
    label: "Vendor",
    sortKey: "vendor",
    defaultVisible: true,
    render: (s) => (
      <Td label="Vendor" secondary>
        {s.job.vendor.name}
      </Td>
    ),
  },
  {
    key: "recruiter",
    label: "Submitted by",
    sortKey: "recruiter",
    defaultVisible: true,
    render: (s) => (
      <Td label="Submitted by" secondary>
        {s.submittedBy.fullName}
      </Td>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortKey: "status",
    defaultVisible: true,
    render: (s) => (
      <Td label="Status">
        <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
          {SUBMISSION_STATUS_LABEL[s.status]}
        </Badge>
      </Td>
    ),
  },
  {
    key: "rounds",
    label: "Rounds",
    sortKey: "rounds",
    sortDefaultDir: "desc",
    align: "right",
    defaultVisible: true,
    render: (s) => (
      <Td label="Rounds" className="text-right tabular-nums">
        {s._count.interviewRounds}
      </Td>
    ),
  },
  {
    key: "submitted",
    label: "Submitted",
    sortKey: "submitted",
    sortDefaultDir: "desc",
    defaultVisible: true,
    render: (s) => (
      <Td label="Submitted" secondary className="whitespace-nowrap">
        {formatDate(s.submittedAt)}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.submissions.columns";
const STORAGE_VERSION = 1;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function SubmissionsTable({
  rows,
  pageOffset = 0,
}: {
  rows: SubmissionListRow[];
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
                <Th
                  key={c.key}
                  className={c.align === "right" ? "text-right" : ""}
                >
                  {c.label}
                </Th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, idx) => (
            <tr key={row.id} className="hover:bg-slate-50">
              {visibleCols.map((c) => (
                <RenderCell
                  key={c.key}
                  column={c}
                  row={row}
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

function RenderCell({
  column,
  row,
  rowNumber,
}: {
  column: Column;
  row: SubmissionListRow;
  rowNumber: number;
}) {
  return <>{column.render(row, rowNumber)}</>;
}

