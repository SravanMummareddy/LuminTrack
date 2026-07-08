"use client";

import { Fragment } from "react";
import Link from "next/link";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import { Pagination } from "@/components/ui/pagination";
import { GroupToggle } from "@/components/bench/group-toggle";
import {
  BENCH_PRIORITY_LABEL,
  BENCH_MARKETING_STATUS_LABEL,
  BENCH_MARKETING_STATUS_TONE,
} from "@/lib/labels";
import { DisciplineBadge } from "@/components/ui/discipline-badge";
import { formatBenchConsultantDisplayId, formatRate, formatDate } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import { cn } from "@/lib/cn";
import type { BenchListRow } from "@/server/queries/bench-consultants";

type Priority = BenchListRow["priority"];

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  /** Returns the cell *content* (the table wraps it in a compact <td>). */
  cell: (row: BenchListRow, rowNumber: number) => React.ReactNode;
};

const muted = "text-slate-400";

/** Text priority chip — label carries the meaning (never color alone); a small
 *  dot echoes the tier. Coral = High, gray = Second, via the theme tokens. */
function PriorityChip({ priority }: { priority: Priority }) {
  const high = priority === "HIGH";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        high
          ? "bg-prio-high-bg text-prio-high-fg"
          : "bg-prio-second-bg text-prio-second-fg",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          high ? "bg-prio-high-dot" : "bg-prio-second-dot",
        )}
      />
      {BENCH_PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Placeholder / test rows (E2E fixtures, or an all-empty row) sink to the
 *  bottom of their group, greyed — they must never head a group. */
function isPlaceholder(c: BenchListRow): boolean {
  if (/\be2e\b/i.test(c.fullName)) return true;
  const signal = [
    c.candidate?.technology,
    c.currentLocation,
    c.mVisa || c.workAuthorization || c.aVisa,
    c.recruiter?.fullName,
  ].filter(Boolean).length;
  return signal === 0;
}

/** Real rows first (server order preserved), placeholders last. */
function sink(rows: BenchListRow[]): BenchListRow[] {
  const real: BenchListRow[] = [];
  const test: BenchListRow[] = [];
  for (const r of rows) (isPlaceholder(r) ? test : real).push(r);
  return [...real, ...test];
}

const COLUMNS: Column[] = [
  {
    key: "sno",
    label: "S.No",
    align: "right",
    defaultVisible: true,
    cell: (_r, n) => n,
  },
  {
    key: "id",
    label: "ID",
    defaultVisible: false,
    cell: (c) => (
      <span className="font-mono text-[11px] text-slate-400">
        {formatBenchConsultantDisplayId(c)}
      </span>
    ),
  },
  {
    key: "name",
    label: "Candidate Name",
    sortKey: "name",
    defaultVisible: true,
    cell: (c) => (
      <>
        <Link
          href={`/bench/${c.id}`}
          className="font-medium text-indigo-600 hover:underline"
        >
          {c.fullName}
        </Link>
      </>
    ),
  },
  {
    key: "technology",
    label: "Technology",
    sortKey: "technology",
    defaultVisible: true,
    cell: (c) => c.candidate?.technology ?? "—",
  },
  {
    key: "discipline",
    label: "Discipline",
    defaultVisible: false,
    cell: (c) => <DisciplineBadge discipline={c.candidate?.discipline} />,
  },
  {
    key: "visa",
    label: "Visa",
    defaultVisible: true,
    cell: (c) => {
      const primary = c.mVisa || c.workAuthorization || c.aVisa;
      const secondary = c.mVisa && c.aVisa ? c.aVisa : null;
      return (
        <>
          {primary ?? "—"}
          {secondary && <span className={muted}> · {secondary}</span>}
        </>
      );
    },
  },
  {
    key: "experience",
    label: "Experience",
    sortKey: "experience",
    align: "right",
    defaultVisible: true,
    cell: (c) => {
      const m = c.marketingExpYears;
      const r = c.realTimeExpYears;
      if (m == null && r == null) return "—";
      const primary = m ?? r;
      return (
        <>
          {primary}y
          {m != null && r != null && <span className={muted}> · {r}y live</span>}
        </>
      );
    },
  },
  {
    key: "location",
    label: "Location",
    sortKey: "location",
    defaultVisible: true,
    cell: (c) => c.currentLocation ?? "—",
  },
  {
    key: "relocation",
    label: "Relocation",
    defaultVisible: true,
    cell: (c) => (c.relocation ? "Yes" : "No"),
  },
  {
    key: "recruiter",
    label: "Recruiter",
    sortKey: "recruiter",
    defaultVisible: true,
    cell: (c) => c.recruiter?.fullName ?? "—",
  },
  {
    key: "status",
    label: "Marketing status",
    sortKey: "status",
    defaultVisible: true,
    cell: (c) => (
      <Badge tone={BENCH_MARKETING_STATUS_TONE[c.marketingStatus]}>
        {BENCH_MARKETING_STATUS_LABEL[c.marketingStatus]}
      </Badge>
    ),
  },
  {
    key: "company",
    label: "Company",
    defaultVisible: false,
    cell: (c) => c.candidate?.currentCompany ?? c.company ?? "—",
  },
  {
    key: "leastRate",
    label: "Least C2C",
    sortKey: "leastRate",
    align: "right",
    defaultVisible: false,
    cell: (c) => formatRate(c.leastRateC2C),
  },
  {
    key: "linked",
    label: "Candidate",
    defaultVisible: false,
    cell: (c) =>
      c.candidateId ? (
        <Link
          href={`/candidates/${c.candidateId}`}
          className="text-indigo-600 hover:underline"
        >
          View profile
        </Link>
      ) : (
        "—"
      ),
  },
  {
    key: "created",
    label: "Created",
    sortKey: "created",
    sortDefaultDir: "desc",
    defaultVisible: false,
    cell: (c) => formatDate(c.createdAt),
  },
  {
    key: "updated",
    label: "Updated",
    sortKey: "updated",
    sortDefaultDir: "desc",
    defaultVisible: false,
    cell: (c) => formatDate(c.updatedAt),
  },
];

/** Flat-view-only Priority column — chip per row, leftmost data column,
 *  sortable. In grouped view the chip lives in the band header instead. */
const PRIORITY_COLUMN: Column = {
  key: "__priority",
  label: "Priority",
  sortKey: "priority",
  defaultVisible: true,
  cell: (c) => <PriorityChip priority={c.priority} />,
};

const STORAGE_KEY = "lumintrack.bench.columns";
const STORAGE_VERSION = 3;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

/** One priority group with its own independent pagination. */
export type BenchGroup = {
  priority: Priority;
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
  groups,
}: {
  rows?: BenchListRow[];
  pageOffset?: number;
  /** e.g. "18 consultants" — shown before the column count. */
  countLabel?: string;
  /** When provided, render as grouped sections (one shared header, slim band
   *  headers between groups). Otherwise render the flat `rows` list. */
  groups?: BenchGroup[];
}) {
  const [prefs, setPrefs] = useColumnPrefs(STORAGE_KEY, STORAGE_VERSION, DEFAULTS);

  const grouped = Boolean(groups);
  const byKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const orderedCols = prefs.order
    .map((k) => byKey.get(k))
    .filter((c): c is Column => Boolean(c));
  const visibleCols = orderedCols.filter((c) => prefs.visible.includes(c.key));
  // Flat view leads with the sortable Priority chip column; grouped view carries
  // priority in the band headers instead, so it isn't repeated per row.
  const renderCols = grouped ? visibleCols : [PRIORITY_COLUMN, ...visibleCols];

  const isEmpty = grouped ? groups!.length === 0 : rows.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500" suppressHydrationWarning>
          {isEmpty
            ? null
            : `${countLabel ? `${countLabel} · ` : ""}Showing ${visibleCols.length} of ${COLUMNS.length} columns`}
        </p>
        <div className="flex items-center gap-2">
          <GroupToggle />
          <ColumnsMenu
            columns={orderedCols.map((c) => ({ key: c.key, label: c.label }))}
            prefs={prefs}
            onChange={setPrefs}
            defaults={DEFAULTS}
          />
        </div>
      </div>

      <MobileSort
        options={renderCols
          .filter((c) => c.sortKey)
          .map((c) => ({
            column: c.sortKey!,
            label: c.label,
            defaultDir: c.sortDefaultDir,
          }))}
      />

      {!isEmpty && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {renderCols.map((c) =>
                  c.sortKey ? (
                    <SortableHeader
                      key={c.key}
                      column={c.sortKey}
                      label={c.label}
                      align={c.align}
                      defaultDir={c.sortDefaultDir}
                    />
                  ) : (
                    <th
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
                        c.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {c.label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {grouped
                ? groups!.map((g) => (
                    <GroupSection
                      key={g.priority}
                      priority={g.priority}
                      count={g.total}
                      rows={g.rows}
                      pageOffset={g.pageOffset}
                      cols={renderCols}
                    />
                  ))
                : sink(rows).map((row, idx) => (
                    <DataRow
                      key={row.id}
                      row={row}
                      cols={renderCols}
                      rowNumber={pageOffset + idx + 1}
                      zebra={idx % 2 === 1}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grouped mode paginates each priority independently — surfaced below the
          single table, labeled, only when a group actually spills a page. */}
      {grouped &&
        groups!
          .filter((g) => g.totalPages > 1)
          .map((g) => (
            <div key={g.priority} className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">
                {BENCH_PRIORITY_LABEL[g.priority]}
              </span>
              <Pagination
                page={g.page}
                totalPages={g.totalPages}
                total={g.total}
                paramKey={g.paramKey}
              />
            </div>
          ))}
    </div>
  );
}

/** A grouped section = a slim band header (chip + count) then its data rows.
 *  The band is the only place a coral wash appears; data rows stay neutral. */
function GroupSection({
  priority,
  count,
  rows,
  pageOffset,
  cols,
}: {
  priority: Priority;
  count: number;
  rows: BenchListRow[];
  pageOffset: number;
  cols: Column[];
}) {
  const high = priority === "HIGH";
  return (
    <>
      <tr>
        <td
          colSpan={cols.length}
          className={cn(
            "border-t border-slate-200 px-4 py-1.5",
            high ? "bg-prio-high-band" : "bg-slate-50",
          )}
        >
          <div className="flex items-center gap-2">
            <PriorityChip priority={priority} />
            <span className="text-[11px] tabular-nums text-slate-500">{count}</span>
          </div>
        </td>
      </tr>
      {sink(rows).map((row, idx) => (
        <DataRow
          key={row.id}
          row={row}
          cols={cols}
          rowNumber={pageOffset + idx + 1}
          zebra={idx % 2 === 1}
        />
      ))}
    </>
  );
}

/** A single ~32px Finder row: zebra base, accent-tint hover, single-line cells. */
function DataRow({
  row,
  cols,
  rowNumber,
  zebra,
}: {
  row: BenchListRow;
  cols: Column[];
  rowNumber: number;
  zebra: boolean;
}) {
  const placeholder = isPlaceholder(row);
  return (
    <tr
      className={cn(
        "border-t border-slate-100 transition-colors hover:bg-indigo-100",
        zebra ? "bg-slate-50" : "bg-white",
        placeholder && "text-slate-400 opacity-60",
      )}
    >
      {cols.map((c) => (
        <td
          key={c.key}
          className={cn(
            "whitespace-nowrap px-4 py-1.5 align-middle leading-tight text-slate-600",
            c.align === "right" && "text-right tabular-nums",
          )}
        >
          {c.cell(row, rowNumber)}
        </td>
      ))}
    </tr>
  );
}
