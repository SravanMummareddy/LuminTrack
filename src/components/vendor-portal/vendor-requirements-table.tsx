"use client";

import Link from "next/link";
import { Table, Th, Td, cardLinkRaise } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_STATUS_TONE,
  BENCH_ENGAGEMENT_LABEL,
} from "@/lib/labels";
import {
  formatDate,
  formatRate,
  formatVendorRequirementDisplayId,
} from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { VendorRequirementRow } from "@/server/queries/requirements";

/** Extra per-render context. In "submit mode" (a candidate is being submitted
 *  from the bench/candidate page) the ID cell links straight to the convert
 *  page with the candidate preselected, instead of the requirement detail. */
type RenderCtx = { submitCandidateId?: string };

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (
    row: VendorRequirementRow,
    rowNumber: number,
    ctx: RenderCtx,
  ) => React.ReactNode;
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
    render: (r, _n, ctx) =>
      ctx.submitCandidateId ? (
        <Td label="ID" className="whitespace-nowrap">
          <Link
            href={`/vendor-portal/${r.id}/convert?candidateId=${ctx.submitCandidateId}`}
            className="font-medium text-emerald-700 hover:underline"
          >
            Submit here →
          </Link>
        </Td>
      ) : (
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
    key: "submissions",
    label: "Submissions",
    sortKey: "submissions",
    align: "right",
    defaultVisible: true,
    render: (r) => (
      <Td label="Submissions" className="text-right tabular-nums">
        <Link
          href={`/vendor-portal/${r.id}`}
          className={
            r._count.submissions > 0
              ? "font-medium text-indigo-600 hover:underline"
              : "text-slate-300 hover:underline"
          }
        >
          {r._count.submissions}
        </Link>
      </Td>
    ),
  },
  {
    key: "candidate",
    // The candidates actually submitted against this requirement (VPR-first).
    // First couple as chips + "+N" for the rest; the cell links to the detail.
    label: "Candidates",
    defaultVisible: true,
    render: (r) => {
      const extra = r._count.submissions - r.submissions.length;
      return (
        <Td label="Candidates">
          {r._count.submissions === 0 ? (
            <span className="text-sm text-slate-400">No candidates yet</span>
          ) : (
            <Link
              href={`/vendor-portal/${r.id}`}
              className="inline-flex flex-wrap items-center gap-1"
            >
              {r.submissions.map((s) => (
                <span
                  key={s.id}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                >
                  {s.candidate?.fullName ?? "—"}
                </span>
              ))}
              {extra > 0 && (
                <span className="text-xs text-slate-400">+{extra}</span>
              )}
            </Link>
          )}
        </Td>
      );
    },
  },
  {
    key: "job",
    label: "Job",
    sortKey: "job",
    defaultVisible: true,
    render: (r) => (
      <Td heading>
        <Link
          href={`/jobs/${r.job.id}`}
          className={`${cardLinkRaise} font-medium text-slate-800 hover:underline`}
        >
          {r.job.title}
        </Link>
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
        {r.job.vendor?.name ?? "—"}
      </Td>
    ),
  },
  {
    key: "client",
    label: "Client",
    sortKey: "client",
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
    sortKey: "pay",
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
    sortKey: "bill",
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
    sortKey: "location",
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
    sortKey: "engagement",
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
    sortKey: "recruiter",
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
    sortKey: "teamLead",
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
    sortKey: "vendorRecruiter",
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

const STORAGE_KEY = "lumintrack.vendorRequirements.columns";
const STORAGE_VERSION = 1;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function VendorRequirementsTable({
  rows,
  pageOffset = 0,
  countLabel,
  submitCandidateId,
}: {
  rows: VendorRequirementRow[];
  pageOffset?: number;
  /** e.g. "22 requirements" — shown before the column count. */
  countLabel?: string;
  /** Submit-mode: when set, each row's ID cell becomes a "Submit here →" link to
   *  the convert page with this candidate preselected. */
  submitCandidateId?: string;
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
                  ctx={{ submitCandidateId }}
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
  ctx,
}: {
  column: Column;
  row: VendorRequirementRow;
  rowNumber: number;
  ctx: RenderCtx;
}) {
  return <>{column.render(row, rowNumber, ctx)}</>;
}
