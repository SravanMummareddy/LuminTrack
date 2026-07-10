import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
import { SUBMISSION_STATUSES, SUBMISSION_STATUS_LABEL, OTHER_SOURCE } from "@/lib/labels";

type Option = { id: string; name: string };

/**
 * Submissions list filters as the shared pill `FilterBar`. Status / Date and the
 * "Mine, stale >7d" quick toggle show as pills; the rest live under "More".
 */
export function SubmissionFilters({
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
      multi: true,
      options: [
        { value: "", label: "All statuses" },
        ...SUBMISSION_STATUSES.map((s) => ({ value: s, label: SUBMISSION_STATUS_LABEL[s] })),
      ],
    },
    { kind: "date", label: "Submitted", primary: true },
    { kind: "toggle", param: "mineStale", label: "Mine, stale >7d", primary: true },
    { kind: "toggle", param: "missingResume", label: "Missing résumé", primary: true },
    {
      kind: "select",
      param: "recruiterId",
      label: "Submitted by",
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All recruiters" },
        ...recruiters.map((r) => ({ value: r.id, label: r.fullName })),
      ],
    },
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
      multi: true,
      options: [
        { value: "", label: "All sources" },
        ...sources.map((s) => ({ value: s.id, label: s.name })),
        { value: OTHER_SOURCE, label: "Other (manual)" },
      ],
    },
  ];

  return (
    <FilterBar
      basePath="/submissions"
      search={{ param: "q", placeholder: "Search candidate or job…" }}
      filters={filters}
      viewsKey="lumintrack.submissions.views"
    />
  );
}
