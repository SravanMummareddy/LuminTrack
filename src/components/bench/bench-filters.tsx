import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
import {
  BENCH_PRIORITIES,
  BENCH_PRIORITY_LABEL,
  BENCH_MARKETING_STATUSES,
  BENCH_MARKETING_STATUS_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
} from "@/lib/labels";

/**
 * Bench roster filters as the shared pill `FilterBar`. Marketing status defaults
 * to "On bench" (the param is absent for the default).
 */
export function BenchFilters({
  recruiters,
}: {
  recruiters: { id: string; fullName: string }[];
}) {
  const filters: FilterDef[] = [
    {
      kind: "select",
      param: "priority",
      label: "Priority",
      primary: true,
      options: [
        { value: "", label: "All priorities" },
        ...BENCH_PRIORITIES.map((p) => ({ value: p, label: BENCH_PRIORITY_LABEL[p] })),
      ],
    },
    {
      kind: "select",
      param: "status",
      label: "Marketing",
      primary: true,
      defaultValue: "onbench",
      options: [
        { value: "onbench", label: "Being marketed (On bench + Paused)" },
        { value: "all", label: "All" },
        ...BENCH_MARKETING_STATUSES.map((s) => ({
          value: s,
          label: BENCH_MARKETING_STATUS_LABEL[s],
        })),
      ],
    },
    {
      kind: "select",
      param: "recruiterId",
      label: "Recruiter",
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All recruiters" },
        ...recruiters.map((r) => ({ value: r.id, label: r.fullName })),
      ],
    },
    {
      kind: "select",
      param: "discipline",
      label: "Discipline",
      multi: true,
      options: [
        { value: "", label: "All disciplines" },
        ...DISCIPLINES.map((d) => ({ value: d, label: DISCIPLINE_LABEL[d] })),
      ],
    },
  ];

  return (
    <FilterBar
      basePath="/bench"
      search={{ param: "q", placeholder: "Name, technology, location…" }}
      filters={filters}
      viewsKey="lumintrack.bench.views"
    />
  );
}
