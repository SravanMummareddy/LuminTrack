"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import { Pagination } from "@/components/ui/pagination";
import {
  BENCH_PRIORITY_LABEL,
  BENCH_PRIORITY_TONE,
  BENCH_MARKETING_STATUS_LABEL,
  BENCH_MARKETING_STATUS_TONE,
} from "@/lib/labels";
import { formatBenchConsultantDisplayId, formatRate } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { BenchListRow } from "@/server/queries/bench-consultants";

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (row: BenchListRow, rowNumber: number) => React.ReactNode;
};

function yearsLabel(n: number | null): string | null {
  if (n === null) return null;
  return `${n} yr${n === 1 ? "" : "s"}`;
}

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
    // Hidden by default — the sheet's display set is S.No, Name, Technology,
    // Visa, Experience, Location, Relocation, Recruiter. Available via ColumnsMenu.
    defaultVisible: false,
    render: (c) => (
      <Td label="ID" secondary className="whitespace-nowrap font-mono text-xs">
        {formatBenchConsultantDisplayId(c)}
      </Td>
    ),
  },
  {
    key: "name",
    label: "Candidate Name",
    sortKey: "name",
    defaultVisible: true,
    render: (c) => (
      <Td heading>
        <Link
          href={`/bench/${c.id}`}
          className={`${cardLink} font-medium text-indigo-600 hover:underline`}
        >
          {c.fullName}
        </Link>
        {!c.isActive && (
          <span className="ml-2 text-xs text-slate-400">(inactive)</span>
        )}
      </Td>
    ),
  },
  {
    key: "priority",
    label: "Priority",
    sortKey: "priority",
    // Hidden by default — priority is shown as section headers (High / Second)
    // in the default priority sort, matching the sheet. Toggle on via ColumnsMenu.
    defaultVisible: false,
    render: (c) => (
      <Td label="Priority">
        <Badge tone={BENCH_PRIORITY_TONE[c.priority]}>
          {BENCH_PRIORITY_LABEL[c.priority]}
        </Badge>
      </Td>
    ),
  },
  {
    key: "technology",
    label: "Technology",
    sortKey: "technology",
    defaultVisible: true,
    render: (c) => (
      <Td label="Technology" secondary>
        {c.technology ?? "—"}
      </Td>
    ),
  },
  {
    key: "visa",
    label: "Visa",
    defaultVisible: true,
    render: (c) => {
      const primary = c.mVisa || c.workAuthorization || c.aVisa;
      const secondary = c.mVisa && c.aVisa ? c.aVisa : null;
      return (
        <Td label="Visa" secondary>
          {primary ?? "—"}
          {secondary && (
            <div className="text-xs text-slate-400">{secondary}</div>
          )}
        </Td>
      );
    },
  },
  {
    key: "experience",
    label: "Experience",
    align: "right",
    defaultVisible: true,
    render: (c) => {
      const marketing = yearsLabel(c.marketingExpYears);
      const real = yearsLabel(c.realTimeExpYears);
      return (
        <Td label="Experience" secondary className="text-right tabular-nums">
          {marketing ?? real ?? "—"}
          {marketing && real && (
            <div className="text-xs text-slate-400">{real} real-time</div>
          )}
        </Td>
      );
    },
  },
  {
    key: "location",
    label: "Location",
    sortKey: "location",
    defaultVisible: true,
    render: (c) => (
      <Td label="Location" secondary>
        {c.currentLocation ?? "—"}
      </Td>
    ),
  },
  {
    key: "relocation",
    label: "Relocation",
    defaultVisible: true,
    render: (c) => (
      <Td label="Relocation" secondary>
        {c.relocation ? "Yes" : "No"}
      </Td>
    ),
  },
  {
    key: "recruiter",
    label: "Recruiter",
    sortKey: "recruiter",
    defaultVisible: true,
    render: (c) => (
      <Td label="Recruiter" secondary>
        {c.recruiter?.fullName ?? "—"}
      </Td>
    ),
  },
  {
    key: "status",
    label: "Marketing status",
    sortKey: "status",
    defaultVisible: false,
    render: (c) => (
      <Td label="Marketing status">
        <Badge tone={BENCH_MARKETING_STATUS_TONE[c.marketingStatus]}>
          {BENCH_MARKETING_STATUS_LABEL[c.marketingStatus]}
        </Badge>
      </Td>
    ),
  },
  {
    key: "company",
    label: "Company",
    defaultVisible: false,
    render: (c) => (
      <Td label="Company" secondary>
        {c.candidate?.currentCompany ?? c.company ?? "—"}
      </Td>
    ),
  },
  {
    key: "leastRate",
    label: "Least C2C",
    align: "right",
    defaultVisible: false,
    render: (c) => (
      <Td label="Least C2C" className="text-right tabular-nums">
        {formatRate(c.leastRateC2C)}
      </Td>
    ),
  },
  {
    key: "linked",
    label: "Candidate",
    defaultVisible: false,
    render: (c) => (
      <Td label="Candidate" secondary>
        {c.candidateId ? (
          <Link
            href={`/candidates/${c.candidateId}`}
            className="text-indigo-600 hover:underline"
          >
            View profile
          </Link>
        ) : (
          "—"
        )}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.bench.columns";
const STORAGE_VERSION = 2;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

/** One priority group rendered as its own paginated section. S.No restarts at
 *  the group's own page offset, so High and Second each number from 1. */
export type BenchGroup = {
  priority: BenchListRow["priority"];
  rows: BenchListRow[];
  pageOffset: number;
  page: number;
  totalPages: number;
  total: number;
  paramKey: string;
};

export function BenchRosterTable({
  rows = [],
  pageOffset = 0,
  countLabel,
  groupByPriority = false,
  groups,
}: {
  rows?: BenchListRow[];
  pageOffset?: number;
  /** e.g. "18 consultants" — shown before the column count. */
  countLabel?: string;
  /** When sorted by priority (the default), render High/Second section headers
   *  — but only while the Priority column itself is hidden, to match the sheet.
   *  Only applies to the flat (`rows`) path. */
  groupByPriority?: boolean;
  /** When provided, render each priority group as its own section with its own
   *  pagination (independent High/Second paging). Takes precedence over `rows`. */
  groups?: BenchGroup[];
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
  const showGroups =
    groupByPriority && !visibleCols.some((c) => c.key === "priority");

  const isEmpty = groups ? groups.length === 0 : rows.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500" suppressHydrationWarning>
          {isEmpty
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

      {groups ? (
        groups.map((g) => (
          <div key={g.priority} className="space-y-3">
            <RosterRows
              rows={g.rows}
              pageOffset={g.pageOffset}
              visibleCols={visibleCols}
              sectionLabel={BENCH_PRIORITY_LABEL[g.priority]}
            />
            <Pagination
              page={g.page}
              totalPages={g.totalPages}
              total={g.total}
              paramKey={g.paramKey}
            />
          </div>
        ))
      ) : (
        <RosterRows
          rows={rows}
          pageOffset={pageOffset}
          visibleCols={visibleCols}
          inlineGroups={showGroups}
        />
      )}
    </div>
  );
}

/** Renders the table head + body for a set of rows. `sectionLabel` prepends a
 *  single group header (used in per-group paginated mode); `inlineGroups`
 *  inserts a header row whenever the priority changes (the flat default view). */
function RosterRows({
  rows,
  pageOffset,
  visibleCols,
  sectionLabel,
  inlineGroups = false,
}: {
  rows: BenchListRow[];
  pageOffset: number;
  visibleCols: Column[];
  sectionLabel?: string;
  inlineGroups?: boolean;
}) {
  return (
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
        {sectionLabel && (
          <tr className="bg-slate-50">
            <td
              colSpan={visibleCols.length}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {sectionLabel}
            </td>
          </tr>
        )}
        {rows.map((row, idx) => {
          const showHeader =
            inlineGroups && (idx === 0 || rows[idx - 1].priority !== row.priority);
          return (
            <Fragment key={row.id}>
              {showHeader && (
                <tr className="bg-slate-50">
                  <td
                    colSpan={visibleCols.length}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {BENCH_PRIORITY_LABEL[row.priority]}
                  </td>
                </tr>
              )}
              <tr className="hover:bg-slate-50">
                {visibleCols.map((c) => (
                  <RenderCell
                    key={c.key}
                    column={c}
                    row={row}
                    rowNumber={pageOffset + idx + 1}
                  />
                ))}
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}

function RenderCell({
  column,
  row,
  rowNumber,
}: {
  column: Column;
  row: BenchListRow;
  rowNumber: number;
}) {
  return <>{column.render(row, rowNumber)}</>;
}
