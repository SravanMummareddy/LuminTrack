import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  OTHER_SOURCE,
} from "@/lib/labels";
import { roleLabel } from "@/lib/permissions";

type Option = { id: string; name: string };

/**
 * Shared analytics filters for the Dashboard, Reports, and Recruiters pages,
 * rendered as the shared pill `FilterBar`. Date + recruiter show as pills; the
 * rest live under "More". `showStatusFilters` is off for Recruiters;
 * `showRecruiterFilter` is off on the recruiter detail page.
 */
export function AnalyticsFilters({
  basePath,
  clients,
  vendors,
  sources,
  recruiters,
  showStatusFilters = true,
  showRecruiterFilter = true,
  showRoleFilter = false,
  recruiterLabel = "Recruiter",
  recruiterAllLabel = "All recruiters",
}: {
  basePath: string;
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  recruiters: { id: string; fullName: string }[];
  showStatusFilters?: boolean;
  /** Off for the recruiter detail page, which is already scoped to one recruiter. */
  showRecruiterFilter?: boolean;
  /** On for the Recruiters roster only — narrows rows to Recruiter / Team lead /
   *  Manager (multi-select; no selection = all users). */
  showRoleFilter?: boolean;
  /** Label for the individual-person chip. The Recruiters roster passes "User"
   *  because its options follow the selected user type(s). */
  recruiterLabel?: string;
  recruiterAllLabel?: string;
}) {
  const filters: FilterDef[] = [{ kind: "date", label: "Date range", primary: true }];

  if (showRoleFilter)
    filters.push({
      kind: "select",
      param: "roles",
      label: "User type",
      primary: true,
      // Multi-select: pick any combination of Recruiter / Team lead / Manager.
      // No selection = all users (the bar drops the explicit "All" option for
      // multi-selects). The `roles` param parses as a comma-separated list.
      multi: true,
      options: [
        { value: "RECRUITER", label: roleLabel("RECRUITER") },
        { value: "TEAM_LEAD", label: roleLabel("TEAM_LEAD") },
        { value: "MANAGER", label: roleLabel("MANAGER") },
      ],
    });

  if (showRecruiterFilter)
    filters.push({
      kind: "select",
      param: "recruiterId",
      label: recruiterLabel,
      primary: true,
      searchable: true,
      multi: true,
      options: [
        { value: "", label: recruiterAllLabel },
        ...recruiters.map((r) => ({ value: r.id, label: r.fullName })),
      ],
    });

  filters.push(
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
      options: [
        { value: "", label: "All sources" },
        ...sources.map((s) => ({ value: s.id, label: s.name })),
        { value: OTHER_SOURCE, label: "Other (manual)" },
      ],
    },
  );

  if (showStatusFilters)
    filters.push(
      {
        kind: "select",
        param: "jobStatus",
        label: "Job status",
        options: [
          { value: "", label: "All job statuses" },
          ...JOB_STATUSES.map((s) => ({ value: s, label: JOB_STATUS_LABEL[s] })),
        ],
      },
      {
        kind: "select",
        param: "submissionStatus",
        label: "Submission status",
        options: [
          { value: "", label: "All submission statuses" },
          ...SUBMISSION_STATUSES.map((s) => ({ value: s, label: SUBMISSION_STATUS_LABEL[s] })),
        ],
      },
    );

  return <FilterBar basePath={basePath} filters={filters} />;
}
