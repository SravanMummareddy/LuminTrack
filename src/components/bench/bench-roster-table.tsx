"use client";

import Link from "next/link";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
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
    defaultVisible: true,
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
    defaultVisible: true,
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
        {c.company ?? "—"}
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
    label: "Candidate link",
    defaultVisible: false,
    render: (c) => (
      <Td label="Candidate link" secondary>
        {c.candidateId ? "Linked" : "—"}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.bench.columns";
const STORAGE_VERSION = 1;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function BenchRosterTable({
  rows,
  pageOffset = 0,
}: {
  rows: BenchListRow[];
  pageOffset?: number;
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
            : `Showing ${visibleCols.length} of ${COLUMNS.length} columns`}
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
  row: BenchListRow;
  rowNumber: number;
}) {
  return <>{column.render(row, rowNumber)}</>;
}
