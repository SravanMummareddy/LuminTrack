import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";

/**
 * Candidate list filters as the shared pill `FilterBar`. The bar reads the
 * active values straight from the URL, so this needs no props.
 */
export function CandidateFilters() {
  const filters: FilterDef[] = [
    { kind: "text", param: "skill", label: "Skill", placeholder: "e.g. React", primary: true },
    {
      kind: "select",
      param: "status",
      label: "Status",
      primary: true,
      options: [
        { value: "", label: "All candidates" },
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    { kind: "date", label: "Date added", primary: true },
    { kind: "text", param: "location", label: "Location" },
    { kind: "text", param: "workAuthorization", label: "Work auth" },
    { kind: "text", param: "currentCompany", label: "Company" },
    { kind: "number", param: "minExperience", label: "Min exp", suffix: "yrs", placeholder: "0" },
  ];

  return (
    <FilterBar
      basePath="/candidates"
      search={{ param: "q", placeholder: "Search candidate name…" }}
      filters={filters}
      viewsKey="lumintrack.candidates.views"
    />
  );
}
