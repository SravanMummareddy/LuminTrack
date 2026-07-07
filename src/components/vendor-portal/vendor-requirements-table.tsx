"use client";

import Link from "next/link";
import { Table, Th, Td, cardLink, cardLinkRaise } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_STATUS_TONE,
  BENCH_ENGAGEMENT_LABEL,
} from "@/lib/labels";
import { formatRate, formatVendorRequirementDisplayId } from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { VendorRequirementRow } from "@/server/queries/requirements";

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (row: VendorRequirementRow, rowNumber: number) => React.ReactNode;
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
    render: (r) => (
      <Td label="ID" secondary className="whitespace-nowrap font-mono text-xs">
        <Link
          href={`/vendor-portal/${r.id}`}
          className="text-indigo-600 hover:underline"
        >
          {formatVendorRequirementDisplayId(r)}
        </Link>
      </Td>
    ),
  },
  {
    key: "candidate",
    label: "Candidate",
    sortKey: "candidate",
    defaultVisible: true,
    render: (r) => (
      <Td heading>
        <Link
          href={`/vendor-portal/${r.id}`}
          className={`${cardLink} font-medium text-indigo-600 hover:underline`}
        >
          {r.candidate?.fullName ?? "— (unassigned)"}
        </Link>
      </Td>
    ),
  },
  {
    key: "job",
    label: "Job",
    sortKey: "job",
    defaultVisible: true,
    render: (r) => (
      <Td label="Job">
        <Link
          href={`/jobs/${r.job.id}`}
          className={`${cardLinkRaise} text-slate-700 hover:underline`}
        >
          {r.job.title}
        </Link>
      </Td>
    ),
  },
  {
    key: "vendor",
    label: "Vendor",
    defaultVisible: true,
    render: (r) => (
      <Td label="Vendor" secondary>
        {r.job.vendor?.name ?? "—"}
      </Td>
    ),
  },
  {
    key: "client",
    label: "Client",
    defaultVisible: true,
    render: (r) => (
      <Td label="Client" secondary>
        {r.job.client?.name ?? "—"}
      </Td>
    ),
  },
  {
    key: "pay",
    label: "Pay",
    align: "right",
    defaultVisible: true,
    render: (r) => (
      <Td label="Pay" className="text-right tabular-nums">
        {formatRate(r.payRate)}
      </Td>
    ),
  },
  {
    key: "bill",
    label: "Bill",
    align: "right",
    defaultVisible: true,
    render: (r) => (
      <Td label="Bill" className="text-right tabular-nums">
        {formatRate(r.billRate)}
      </Td>
    ),
  },
  {
    key: "location",
    label: "Location",
    defaultVisible: true,
    render: (r) => (
      <Td label="Location" secondary>
        {r.location ?? r.job.location ?? "—"}
      </Td>
    ),
  },
  {
    key: "engagement",
    label: "C2C/W2",
    defaultVisible: true,
    render: (r) => (
      <Td label="C2C/W2" secondary>
        {r.engagement ? BENCH_ENGAGEMENT_LABEL[r.engagement] : "—"}
      </Td>
    ),
  },
  {
    key: "recruiter",
    label: "Recruiter",
    defaultVisible: true,
    render: (r) => (
      <Td label="Recruiter" secondary>
        {r.recruiter?.fullName ?? "—"}
      </Td>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortKey: "status",
    defaultVisible: true,
    render: (r) => (
      <Td label="Status">
        <Badge tone={REQUIREMENT_STATUS_TONE[r.status]}>
          {REQUIREMENT_STATUS_LABEL[r.status]}
        </Badge>
      </Td>
    ),
  },
  // Hidden-by-default columns — the rest of the sheet's fields.
  {
    key: "teamLead",
    label: "Team lead",
    defaultVisible: false,
    render: (r) => (
      <Td label="Team lead" secondary>
        {r.teamLead ?? "—"}
      </Td>
    ),
  },
  {
    key: "company",
    label: "Company",
    defaultVisible: false,
    render: (r) => (
      <Td label="Company" secondary>
        {r.candidate?.currentCompany ?? "—"}
      </Td>
    ),
  },
  {
    key: "vendorRecruiter",
    label: "Vendor recruiter",
    defaultVisible: false,
    render: (r) => (
      <Td label="Vendor recruiter" secondary>
        {r.vendorRecruiterName ?? "—"}
      </Td>
    ),
  },
  {
    key: "email",
    label: "Email",
    defaultVisible: false,
    render: (r) => (
      <Td label="Email" secondary>
        {r.candidate?.email ?? "—"}
      </Td>
    ),
  },
  {
    key: "phone",
    label: "Phone",
    defaultVisible: false,
    render: (r) => (
      <Td label="Phone" secondary className="whitespace-nowrap">
        {r.candidate?.phone ?? "—"}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.vendorRequirements.columns";
const STORAGE_VERSION = 1;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function VendorRequirementsTable({
  rows,
  pageOffset = 0,
}: {
  rows: VendorRequirementRow[];
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
  row: VendorRequirementRow;
  rowNumber: number;
}) {
  return <>{column.render(row, rowNumber)}</>;
}
