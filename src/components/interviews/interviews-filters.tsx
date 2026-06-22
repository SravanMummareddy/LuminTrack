import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";

/**
 * Interviews list filters as the shared pill `FilterBar`.
 */
export function InterviewsFilters({
  recruiters,
}: {
  recruiters: { id: string; fullName: string }[];
}) {
  const filters: FilterDef[] = [
    { kind: "date", label: "Interview date", primary: true },
    {
      kind: "select",
      param: "recruiterId",
      label: "Sales recruiter",
      primary: true,
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All recruiters" },
        ...recruiters.map((r) => ({ value: r.id, label: r.fullName })),
      ],
    },
  ];

  return (
    <FilterBar
      basePath="/interviews"
      search={{ param: "q", placeholder: "Candidate, job, or client…" }}
      filters={filters}
    />
  );
}
