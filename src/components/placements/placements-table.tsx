"use client";

import Link from "next/link";
import { Table, Th, Td, cardLink, cardLinkRaise } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  PLACEMENT_STATUS_LABEL,
  PLACEMENT_STATUS_TONE,
  MARGIN_AMBER_THRESHOLD_PCT,
} from "@/lib/labels";
import { formatDate, formatPlacementDisplayId } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { PlacementListRow } from "@/server/queries/placements";

type ViewerContext = { userId: string; userRole: string };

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (row: PlacementListRow, rowNumber: number, ctx: ViewerContext) => React.ReactNode;
};

function canSeeRates(row: PlacementListRow, ctx: ViewerContext): boolean {
  // Managers / team leads see all rates; a recruiter sees rates only on their
  // own placements (matches the server-side canEditRates policy).
  return ctx.userRole !== "RECRUITER" || row.submission.submittedBy.id === ctx.userId;
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
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
    render: (p) => (
      <Td label="ID" secondary className="whitespace-nowrap font-mono text-xs">
        {formatPlacementDisplayId(p)}
      </Td>
    ),
  },
  {
    key: "candidate",
    label: "Candidate",
    sortKey: "candidate",
    defaultVisible: true,
    render: (p) => (
      <Td heading>
        <Link
          href={`/placements/${p.id}`}
          className={`${cardLink} font-medium text-indigo-600 hover:underline`}
        >
          {p.candidate.fullName}
        </Link>
      </Td>
    ),
  },
  {
    key: "job",
    label: "Job",
    sortKey: "job",
    defaultVisible: true,
    render: (p) => (
      <Td label="Job">
        <Link
          href={`/jobs/${p.job.id}`}
          className={`${cardLinkRaise} text-slate-700 hover:underline`}
        >
          {p.job.title}
        </Link>
      </Td>
    ),
  },
  {
    key: "vendor",
    label: "Vendor",
    defaultVisible: true,
    render: (p) => (
      <Td label="Vendor" secondary>
        {p.job.vendor?.name ?? "—"}
      </Td>
    ),
  },
  {
    key: "client",
    label: "Client",
    sortKey: "client",
    defaultVisible: true,
    render: (p) => (
      <Td label="Client" secondary>
        {p.job.client.name}
      </Td>
    ),
  },
  {
    key: "start",
    label: "Start",
    sortKey: "start",
    sortDefaultDir: "desc",
    defaultVisible: true,
    render: (p) => (
      <Td label="Start" secondary className="whitespace-nowrap">
        {formatDate(p.startDate)}
      </Td>
    ),
  },
  {
    key: "end",
    label: "End",
    sortKey: "end",
    sortDefaultDir: "asc",
    defaultVisible: true,
    render: (p) => (
      <Td label="End" secondary className="whitespace-nowrap">
        {p.endDate ? formatDate(p.endDate) : "—"}
      </Td>
    ),
  },
  {
    key: "bill",
    label: "Bill",
    align: "right",
    defaultVisible: true,
    render: (p, _n, ctx) => (
      <Td label="Bill" className="text-right tabular-nums">
        {canSeeRates(p, ctx) ? formatMoney(p.billRate) : "—"}
      </Td>
    ),
  },
  {
    key: "pay",
    label: "Pay",
    align: "right",
    defaultVisible: true,
    render: (p, _n, ctx) => (
      <Td label="Pay" className="text-right tabular-nums">
        {canSeeRates(p, ctx) ? formatMoney(p.payRate) : "—"}
      </Td>
    ),
  },
  {
    key: "margin",
    label: "Margin",
    align: "right",
    defaultVisible: true,
    render: (p, _n, ctx) => {
      if (!canSeeRates(p, ctx))
        return (
          <Td label="Margin" className="text-right tabular-nums">
            —
          </Td>
        );
      // Rates-pending placements get a clear flag instead of a misleading $0
      // margin. This covers both an untouched 0/0 placement and the auto-create
      // seed where bill === pay (a duplicated single rate, never a real spread).
      const ratesPending = p.billRate === p.payRate;
      if (ratesPending)
        return (
          <Td label="Margin" className="text-right">
            <span className="text-xs text-amber-700">⚠ pending</span>
          </Td>
        );
      const pct = p.marginPct ?? 0;
      const isAmber = pct < MARGIN_AMBER_THRESHOLD_PCT;
      const isNeg = p.margin < 0;
      return (
        <Td label="Margin" className="text-right tabular-nums">
          <span className={isNeg ? "text-red-600" : isAmber ? "text-amber-700" : ""}>
            {formatMoney(p.margin)}
            {p.marginPct !== null && (
              <span className="ml-1 text-xs text-slate-500">
                ({p.marginPct.toFixed(0)}%)
              </span>
            )}
          </span>
        </Td>
      );
    },
  },
  {
    key: "status",
    label: "Status",
    sortKey: "status",
    defaultVisible: true,
    render: (p) => (
      <Td label="Status">
        <Badge tone={PLACEMENT_STATUS_TONE[p.status]}>
          {PLACEMENT_STATUS_LABEL[p.status]}
        </Badge>
      </Td>
    ),
  },
  {
    key: "recruiter",
    label: "Recruiter",
    // Visible by default — the sheet's Placements display set is
    // Name · Vendor · Client · Role · Bill · Pay · Recruiter.
    defaultVisible: true,
    render: (p) => (
      <Td label="Recruiter" secondary>
        {p.submission.submittedBy.fullName}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.placements.columns";
const STORAGE_VERSION = 2;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function PlacementsTable({
  rows,
  pageOffset = 0,
  countLabel,
  viewer,
}: {
  rows: PlacementListRow[];
  pageOffset?: number;
  /** e.g. "12 placements" — shown before the column count. */
  countLabel?: string;
  viewer: ViewerContext;
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
                  viewer={viewer}
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
  viewer,
}: {
  column: Column;
  row: PlacementListRow;
  rowNumber: number;
  viewer: ViewerContext;
}) {
  return <>{column.render(row, rowNumber, viewer)}</>;
}
