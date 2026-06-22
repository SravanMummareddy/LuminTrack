"use client";

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
      const link = s.candidateResume?.driveLink ?? s.resumeDriveLink;
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
  storageKey = STORAGE_KEY,
  defaultVisibleKeys,
}: {
  rows: SubmissionListRow[];
  pageOffset?: number;
  /** Override the localStorage key so a scoped view (e.g. Vendor Portal) keeps
   *  its own column prefs separate from the main Submissions list. */
  storageKey?: string;
  /** Override which columns are visible by default (the Vendor Portal view
   *  surfaces the sheet's Pay/Bill/C2C-W2/resume columns up front). */
  defaultVisibleKeys?: string[];
}) {
  const defaults: ColumnPrefs = defaultVisibleKeys
    ? { visible: defaultVisibleKeys, order: COLUMNS.map((c) => c.key) }
    : DEFAULTS;
  const [prefs, setPrefs] = useColumnPrefs(
    storageKey,
    STORAGE_VERSION,
    defaults,
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
          defaults={defaults}
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

