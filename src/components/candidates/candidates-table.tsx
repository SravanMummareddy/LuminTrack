"use client";

import Link from "next/link";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  formatDate,
  formatExperience,
  formatCandidateDisplayId,
} from "@/lib/format";
import { useColumnPrefs, type ColumnPrefs } from "@/lib/use-column-prefs";
import type { CandidateListRow } from "@/server/queries/candidates";

type Column = {
  key: string;
  label: string;
  sortKey?: string;
  sortDefaultDir?: "asc" | "desc";
  align?: "right";
  defaultVisible: boolean;
  render: (row: CandidateListRow, rowNumber: number) => React.ReactNode;
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
    render: (c) => (
      <Td label="ID" secondary className="whitespace-nowrap font-mono text-xs">
        {formatCandidateDisplayId(c)}
      </Td>
    ),
  },
  {
    key: "name",
    label: "Name",
    sortKey: "name",
    defaultVisible: true,
    render: (c) => (
      <Td heading>
        <span className="flex items-center gap-2">
          <Link
            href={`/candidates/${c.id}`}
            className={`${cardLink} font-medium text-indigo-600 hover:underline`}
          >
            {c.fullName}
          </Link>
          {!c.isActive && <Badge tone="slate">Inactive</Badge>}
        </span>
      </Td>
    ),
  },
  {
    key: "email",
    label: "Email",
    sortKey: "email",
    defaultVisible: true,
    render: (c) => (
      <Td label="Email" secondary>
        {c.email || "—"}
      </Td>
    ),
  },
  {
    key: "phone",
    label: "Phone",
    sortKey: "phone",
    defaultVisible: true,
    render: (c) => (
      <Td label="Phone" secondary>
        {c.phone || "—"}
      </Td>
    ),
  },
  {
    key: "location",
    label: "Location",
    sortKey: "location",
    defaultVisible: true,
    render: (c) => <Td label="Location">{c.currentLocation || "—"}</Td>,
  },
  {
    key: "experience",
    label: "Experience",
    sortKey: "experience",
    defaultVisible: true,
    render: (c) => (
      <Td label="Experience" className="whitespace-nowrap">
        {formatExperience(c.totalExperienceYears)}
      </Td>
    ),
  },
  {
    key: "skills",
    label: "Skills",
    defaultVisible: false,
    render: (c) => {
      // Prefer starred skills when set, else first 3 of the full list. Cap at
      // 3 chips with a +N affordance so the row stays single-height.
      const skills = c.skills ?? [];
      const featured = c.featuredSkills ?? [];
      const primary = featured.length > 0 ? featured : skills.slice(0, 3);
      const shown = primary.slice(0, 3);
      const overflow = skills.filter((s) => !shown.includes(s));
      return (
        <Td label="Skills" secondary>
          {skills.length === 0 ? (
            "—"
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {shown.map((s) => (
                <Badge key={s} tone="slate">
                  {s}
                </Badge>
              ))}
              {overflow.length > 0 && (
                <span
                  title={overflow.join(", ")}
                  className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                >
                  +{overflow.length}
                </span>
              )}
            </div>
          )}
        </Td>
      );
    },
  },
  {
    key: "subs",
    label: "Subs",
    sortKey: "subs",
    sortDefaultDir: "desc",
    align: "right",
    defaultVisible: true,
    render: (c) => (
      <Td label="Subs" className="text-right tabular-nums">
        {c._count.submissions}
      </Td>
    ),
  },
  {
    key: "updated",
    label: "Updated",
    sortKey: "updated",
    sortDefaultDir: "desc",
    defaultVisible: true,
    render: (c) => (
      <Td label="Updated" secondary className="whitespace-nowrap">
        {formatDate(c.updatedAt)}
      </Td>
    ),
  },
  // Hidden-by-default extras
  {
    key: "workAuthorization",
    label: "Work auth",
    sortKey: "workAuthorization",
    defaultVisible: false,
    render: (c) => (
      <Td label="Work auth" secondary>
        {c.workAuthorization || "—"}
      </Td>
    ),
  },
  {
    key: "currentCompany",
    label: "Current company",
    sortKey: "currentCompany",
    defaultVisible: false,
    render: (c) => (
      <Td label="Current company" secondary>
        {c.currentCompany || "—"}
      </Td>
    ),
  },
];

const STORAGE_KEY = "lumintrack.candidates.columns";
// Bumped to 2 in Round 3.5 — Skills column flipped to hidden-by-default, so
// existing prefs (which assumed Skills was visible) reset cleanly once.
const STORAGE_VERSION = 2;
const DEFAULTS: ColumnPrefs = {
  visible: COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  order: COLUMNS.map((c) => c.key),
};

export function CandidatesTable({
  rows,
  pageOffset = 0,
  countLabel,
}: {
  rows: CandidateListRow[];
  pageOffset?: number;
  /** e.g. "30 candidates" — shown before the column count. */
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
  row: CandidateListRow;
  rowNumber: number;
}) {
  return <>{column.render(row, rowNumber)}</>;
}

