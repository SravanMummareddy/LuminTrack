import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  OTHER_SOURCE,
  DISCIPLINES,
  DISCIPLINE_LABEL,
} from "@/lib/labels";

type Option = { id: string; name: string };

/**
 * Job list filters as the shared pill `FilterBar`; the bar reads active values
 * from the URL. Status / Client / Date show as pills; the rest live under
 * "More" until set.
 */
export function JobFilters({
  clients,
  vendors,
  sources,
  recruiters,
}: {
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  recruiters: { id: string; fullName: string }[];
}) {
  const filters: FilterDef[] = [
    {
      kind: "select",
      param: "status",
      label: "Status",
      primary: true,
      options: [
        { value: "", label: "All statuses" },
        ...JOB_STATUSES.map((s) => ({ value: s, label: JOB_STATUS_LABEL[s] })),
      ],
    },
    {
      kind: "select",
      param: "discipline",
      label: "Discipline",
      options: [
        { value: "", label: "All disciplines" },
        ...DISCIPLINES.map((d) => ({ value: d, label: DISCIPLINE_LABEL[d] })),
      ],
    },
    {
      kind: "select",
      param: "clientId",
      label: "Client",
      primary: true,
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All clients" },
        ...clients.map((c) => ({ value: c.id, label: c.name })),
      ],
    },
    { kind: "date", label: "Date added", primary: true },
    {
      kind: "select",
      param: "vendorId",
      label: "Vendor",
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All vendors" },
        ...vendors.map((v) => ({ value: v.id, label: v.name })),
      ],
    },
    {
      kind: "select",
      param: "sisterCompanySourceId",
      label: "Source",
      searchable: true,
      options: [
        { value: "", label: "All sources" },
        ...sources.map((s) => ({ value: s.id, label: s.name })),
        { value: OTHER_SOURCE, label: "Other (manual)" },
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
    { kind: "text", param: "location", label: "Location", placeholder: "e.g. Remote" },
  ];

  return (
    <FilterBar
      basePath="/jobs"
      search={{ param: "q", placeholder: "Search job title…" }}
      filters={filters}
      viewsKey="lumintrack.jobs.views"
    />
  );
}
