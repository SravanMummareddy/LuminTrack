"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, Th, Td, cardLink, cardLinkRaise } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import { BENCH_ENGAGEMENT_LABEL } from "@/lib/labels";
import { SubmissionStatusCell } from "@/components/submissions/submission-status-cell";
import { formatDate, formatSubmissionDisplayId } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import { STALE_STAGE_DAYS } from "@/lib/analytics";
import type { SubmissionListRow } from "@/server/queries/submissions";
import { SubmissionBulkBar } from "@/components/submissions/submission-bulk-bar";

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
    defaultVisible: false,
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
        <Link
          href={`/submissions/${s.id}`}
          className="text-indigo-600 hover:underline"
        >
          {formatSubmissionDisplayId(s)}
        </Link>
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
          className={`${cardLinkRaise} text-slate-700 hover:underline`}
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
      <SubmissionStatusCell submissionId={s.id} status={s.status} />
    ),
  },
  {
    key: "daysInStage",
    label: "Days in stage",
    sortKey: "daysInStage",
    sortDefaultDir: "desc",
    align: "right",
    defaultVisible: true,
    render: (s) => {
      const stale = s.daysInStage > STALE_STAGE_DAYS;
      return (
        <Td
          label="Days in stage"
          className={`text-right tabular-nums ${
            stale ? "font-semibold text-amber-700" : "text-slate-600"
          }`}
        >
          <span
            title={
              stale
                ? `In this stage ${s.daysInStage} days — over the ${STALE_STAGE_DAYS}-day mark`
                : `In this stage ${s.daysInStage} day${s.daysInStage === 1 ? "" : "s"}`
            }
          >
            {s.daysInStage}d
          </span>
        </Td>
      );
    },
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
  {
    key: "engagement",
    label: "Engagement",
    sortKey: "engagement",
    defaultVisible: false,
    render: (s) => (
      <Td label="Engagement" secondary>
        {s.engagement ? BENCH_ENGAGEMENT_LABEL[s.engagement] : "—"}
      </Td>
    ),
  },
  {
    key: "vendorRecruiter",
    label: "Vendor recruiter",
    sortKey: "vendorRecruiter",
    defaultVisible: false,
    render: (s) => (
      <Td label="Vendor recruiter" secondary>
        {s.vendorRecruiterName ?? "—"}
      </Td>
    ),
  },
  {
    key: "payRate",
    label: "Pay rate",
    sortKey: "payRate",
    align: "right",
    defaultVisible: false,
    render: (s) => (
      <Td label="Pay rate" secondary className="tabular-nums">
        {s.payRate != null ? `$${s.payRate}/hr` : "—"}
      </Td>
    ),
  },
  {
    key: "billRate",
    label: "Bill rate",
    sortKey: "billRate",
    align: "right",
    defaultVisible: false,
    render: (s) => (
      <Td label="Bill rate" secondary className="tabular-nums">
        {s.billRate != null ? `$${s.billRate}/hr` : "—"}
      </Td>
    ),
  },
  {
    key: "teamLead",
    label: "Team lead",
    sortKey: "teamLead",
    defaultVisible: false,
    render: (s) => (
      <Td label="Team lead" secondary>
        {s.teamLead ?? "—"}
      </Td>
    ),
  },
  {
    key: "resume",
    label: "Submitted resume",
    defaultVisible: false,
    render: (s) => {
      const link = s.candidateResumeId ? `/api/resumes/${s.candidateResumeId}` : null;
      const label = s.candidateResume?.label ?? (link ? "Resume" : null);
      return (
        <Td label="Submitted resume" secondary>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              {label}
            </a>
          ) : (
            "—"
          )}
        </Td>
      );
    },
  },
  {
    key: "created",
    label: "Created",
    sortKey: "created",
    sortDefaultDir: "desc",
    defaultVisible: false,
    render: (s) => (
      <Td label="Created" secondary className="whitespace-nowrap">
        {formatDate(s.createdAt)}
      </Td>
    ),
  },
  {
    key: "updated",
    label: "Updated",
    sortKey: "updated",
    sortDefaultDir: "desc",
    defaultVisible: false,
    render: (s) => (
      <Td label="Updated" secondary className="whitespace-nowrap">
        {formatDate(s.updatedAt)}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.submissions.columns";
// Bumped to 4 at the bench-sales × Round 5 merge: Round 5 added the
// Days-in-stage column + dropped S.No from defaults (was v2); the bench-sales
// work added engagement/pay/bill/team-lead/resume columns (was v3). Bump past
// both so every existing saved pref resets to the combined new defaults.
const STORAGE_VERSION = 4;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function SubmissionsTable({
  rows,
  pageOffset = 0,
  countLabel,
  storageKey = STORAGE_KEY,
}: {
  rows: SubmissionListRow[];
  pageOffset?: number;
  /** e.g. "160 submissions" — shown before the column count. */
  countLabel?: string;
  /** Override the localStorage key so a scoped view keeps its own column prefs
   *  separate from the main Submissions list. */
  storageKey?: string;
}) {
  const [prefs, setPrefs] = useColumnPrefs(
    storageKey,
    STORAGE_VERSION,
    DEFAULTS,
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
          defaults={DEFAULTS}
        />
      </div>

      {selected.size > 0 && (
        <SubmissionBulkBar
          selectedIds={[...selected]}
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
            <tr
              key={row.id}
              className={
                selected.has(row.id) ? "bg-indigo-50/60" : "hover:bg-slate-50"
              }
            >
              <td className="w-8 px-3 align-middle">
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggleOne(row.id)}
                  aria-label={`Select ${row.candidate.fullName}`}
                  className={checkboxClass}
                />
              </td>
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

