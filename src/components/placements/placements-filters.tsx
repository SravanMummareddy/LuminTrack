import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
import { PLACEMENT_STATUSES, PLACEMENT_STATUS_LABEL } from "@/lib/labels";

/**
 * Placement list filters as the shared pill `FilterBar`. Status defaults to
 * ACTIVE (the param is absent for the default); "All statuses" widens it.
 */
export function PlacementsFilters({
  clients,
  recruiters,
}: {
  clients: { id: string; name: string }[];
  recruiters: { id: string; fullName: string }[];
}) {
  const filters: FilterDef[] = [
    {
      kind: "select",
      param: "status",
      label: "Status",
      primary: true,
      defaultValue: "ACTIVE",
      options: [
        { value: "all", label: "All statuses" },
        ...PLACEMENT_STATUSES.map((s) => ({ value: s, label: PLACEMENT_STATUS_LABEL[s] })),
      ],
    },
    { kind: "date", label: "Started", primary: true },
    {
      kind: "select",
      param: "clientId",
      label: "Client",
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All clients" },
        ...clients.map((c) => ({ value: c.id, label: c.name })),
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
  ];

  return (
    <FilterBar
      basePath="/placements"
      search={{ param: "q", placeholder: "Candidate or job…" }}
      filters={filters}
      viewsKey="lumintrack.placements.views"
    />
  );
}
