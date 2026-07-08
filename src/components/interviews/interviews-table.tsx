"use client";

import Link from "next/link";
import { Table, Th, Td, cardLink, cardLinkRaise } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_RESULT_TONE,
} from "@/lib/labels";
import { formatDate, formatTime, formatSubmissionDisplayId } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { InterviewListRow } from "@/server/queries/interviews";

function technology(c: InterviewListRow["submission"]["candidate"]): string {
  return c.featuredSkills[0] ?? c.skills[0] ?? "—";
}

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (row: InterviewListRow, rowNumber: number) => React.ReactNode;
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
    key: "date",
    label: "Date of interview",
    sortKey: "date",
    sortDefaultDir: "desc",
    defaultVisible: true,
    render: (r) => (
      <Td label="Date of interview" secondary className="whitespace-nowrap">
        {r.scheduledAt ? formatDate(r.scheduledAt) : "—"}
      </Td>
    ),
  },
  {
    key: "time",
    label: "Time",
    defaultVisible: true,
    render: (r) => (
      <Td label="Time" secondary className="whitespace-nowrap">
        {r.scheduledAt ? formatTime(r.scheduledAt) : "—"}
      </Td>
    ),
  },
  {
    key: "candidate",
    label: "Candidate",
    sortKey: "candidate",
    defaultVisible: true,
    render: (r) => {
      const c = r.submission.candidate;
      return (
        <Td heading>
          <Link
            href={`/candidates/${c.id}`}
            className={`${cardLink} font-medium text-indigo-600 hover:underline`}
          >
            {c.fullName}
          </Link>
        </Td>
      );
    },
  },
  {
    key: "client",
    label: "Client",
    sortKey: "client",
    defaultVisible: true,
    render: (r) => (
      <Td label="Client" secondary>
        {r.submission.job.client.name}
      </Td>
    ),
  },
  {
    key: "vendor",
    label: "Vendor",
    sortKey: "vendor",
    defaultVisible: true,
    render: (r) => (
      <Td label="Vendor" secondary>
        {r.submission.job.vendor?.name ?? "—"}
      </Td>
    ),
  },
  {
    key: "location",
    label: "Location",
    sortKey: "location",
    defaultVisible: true,
    render: (r) => (
      <Td label="Location" secondary>
        {r.submission.job.location ?? "—"}
      </Td>
    ),
  },
  {
    key: "recruiter",
    label: "Sales recruiter",
    sortKey: "recruiter",
    defaultVisible: true,
    render: (r) => (
      <Td label="Sales recruiter" secondary>
        {r.submission.submittedBy.fullName}
      </Td>
    ),
  },
  {
    key: "technology",
    label: "Technology",
    defaultVisible: false,
    render: (r) => (
      <Td label="Technology" secondary>
        {technology(r.submission.candidate)}
      </Td>
    ),
  },
  {
    key: "round",
    label: "Round",
    defaultVisible: true,
    render: (r) => (
      <Td label="Round" secondary>
        <Link
          href={`/submissions/${r.submission.id}`}
          className={`${cardLinkRaise} text-slate-700 hover:underline`}
        >
          {r.roundName}
        </Link>
        <span className="ml-1 text-xs text-slate-400">
          · {INTERVIEW_TYPE_LABEL[r.interviewType]}
        </span>
        <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
          {formatSubmissionDisplayId(r.submission)} · R{r.roundOrder}
        </span>
      </Td>
    ),
  },
  {
    key: "support",
    label: "Support",
    defaultVisible: false,
    render: (r) => (
      <Td label="Support" secondary>
        {r.supportNeeded ? (
          <span className="font-medium text-indigo-700">Yes</span>
        ) : (
          "—"
        )}
      </Td>
    ),
  },
  {
    key: "result",
    label: "Result",
    sortKey: "result",
    defaultVisible: true,
    render: (r) => (
      <Td label="Result">
        <Badge tone={INTERVIEW_RESULT_TONE[r.result]}>
          {INTERVIEW_RESULT_LABEL[r.result]}
        </Badge>
      </Td>
    ),
  },
  {
    key: "remarks",
    label: "Remarks",
    defaultVisible: false,
    render: (r) => (
      <Td label="Remarks" secondary>
        {r.feedback ? (
          <span
            title={r.feedback}
            className="line-clamp-2 max-w-[16rem] text-xs text-slate-500"
          >
            {r.feedback}
          </span>
        ) : (
          "—"
        )}
      </Td>
    ),
  },
  {
    key: "created",
    label: "Created",
    sortKey: "created",
    sortDefaultDir: "desc",
    defaultVisible: false,
    render: (r) => (
      <Td label="Created" secondary className="whitespace-nowrap">
        {formatDate(r.createdAt)}
      </Td>
    ),
  },
  {
    key: "updated",
    label: "Updated",
    sortKey: "updated",
    sortDefaultDir: "desc",
    defaultVisible: false,
    render: (r) => (
      <Td label="Updated" secondary className="whitespace-nowrap">
        {formatDate(r.updatedAt)}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.interviews.columns";
const STORAGE_VERSION = 1;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function InterviewsTable({
  rows,
  pageOffset = 0,
  countLabel,
}: {
  rows: InterviewListRow[];
  pageOffset?: number;
  /** e.g. "30 interviews" — shown before the column count. */
  countLabel?: string;
}) {
  const [prefs, setPrefs] = useColumnPrefs(
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
  row: InterviewListRow;
  rowNumber: number;
}) {
  return <>{column.render(row, rowNumber)}</>;
}
