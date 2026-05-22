import { Input, Select } from "@/components/ui/field";
import { FilterBar, type FilterChip } from "@/components/ui/filter-bar";
import { DATE_PRESETS } from "@/lib/filters";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  OTHER_SOURCE,
} from "@/lib/labels";
import type { JobStatus, SubmissionStatus } from "@/generated/prisma/enums";
import type { AnalyticsParamState } from "@/lib/analytics";

type Option = { id: string; name: string };

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/**
 * Shared analytics filter bar for the Dashboard, Reports, and Recruiters pages,
 * rendered through the shared FilterBar: date range + recruiter stay visible,
 * the rest collapse behind "Filters". `showStatusFilters` is off for Recruiters.
 */
export function AnalyticsFilters({
  current,
  basePath,
  clients,
  vendors,
  sources,
  recruiters,
  showStatusFilters = true,
  showRecruiterFilter = true,
}: {
  current: AnalyticsParamState;
  basePath: string;
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  recruiters: { id: string; fullName: string }[];
  showStatusFilters?: boolean;
  /** Off for the recruiter detail page, which is already scoped to one recruiter. */
  showRecruiterFilter?: boolean;
}) {
  const clientName = clients.find((c) => c.id === current.clientId)?.name;
  const vendorName = vendors.find((v) => v.id === current.vendorId)?.name;
  const sourceName =
    current.sisterCompanySourceId === OTHER_SOURCE
      ? "Other (manual)"
      : sources.find((s) => s.id === current.sisterCompanySourceId)?.name;
  const recruiterName = recruiters.find(
    (r) => r.id === current.recruiterId,
  )?.fullName;
  const presetLabel =
    current.preset && current.preset !== "all"
      ? DATE_PRESETS.find((p) => p.value === current.preset)?.label
      : undefined;

  const chips: FilterChip[] = [];
  if (presetLabel)
    chips.push({ keys: ["preset", "from", "to"], label: `Date: ${presetLabel}` });
  if (showRecruiterFilter && recruiterName)
    chips.push({ keys: ["recruiterId"], label: `Recruiter: ${recruiterName}` });
  if (clientName)
    chips.push({ keys: ["clientId"], label: `Client: ${clientName}` });
  if (vendorName)
    chips.push({ keys: ["vendorId"], label: `Vendor: ${vendorName}` });
  if (sourceName)
    chips.push({
      keys: ["sisterCompanySourceId"],
      label: `Source: ${sourceName}`,
    });
  if (showStatusFilters && current.jobStatus)
    chips.push({
      keys: ["jobStatus"],
      label: `Job status: ${JOB_STATUS_LABEL[current.jobStatus as JobStatus] ?? current.jobStatus}`,
    });
  if (showStatusFilters && current.submissionStatus)
    chips.push({
      keys: ["submissionStatus"],
      label: `Submission status: ${SUBMISSION_STATUS_LABEL[current.submissionStatus as SubmissionStatus] ?? current.submissionStatus}`,
    });

  const advancedActiveCount =
    (current.clientId ? 1 : 0) +
    (current.vendorId ? 1 : 0) +
    (current.sisterCompanySourceId ? 1 : 0) +
    (showStatusFilters && current.jobStatus ? 1 : 0) +
    (showStatusFilters && current.submissionStatus ? 1 : 0);

  const primary = (
    <>
      <div className="sm:w-48">
        <label className={labelClass} htmlFor="f-preset">
          Date range
        </label>
        <Select id="f-preset" name="preset" defaultValue={current.preset ?? "all"}>
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      {showRecruiterFilter && (
        <div className="sm:w-52">
          <label className={labelClass} htmlFor="f-recruiter">
            Recruiter
          </label>
          <Select
            id="f-recruiter"
            name="recruiterId"
            defaultValue={current.recruiterId ?? ""}
          >
            <option value="">All recruiters</option>
            {recruiters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </Select>
        </div>
      )}
    </>
  );

  const advanced = (
    <>
      <div>
        <label className={labelClass} htmlFor="f-client">
          Client
        </label>
        <Select id="f-client" name="clientId" defaultValue={current.clientId ?? ""}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className={labelClass} htmlFor="f-vendor">
          Vendor
        </label>
        <Select id="f-vendor" name="vendorId" defaultValue={current.vendorId ?? ""}>
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className={labelClass} htmlFor="f-source">
          Source
        </label>
        <Select
          id="f-source"
          name="sisterCompanySourceId"
          defaultValue={current.sisterCompanySourceId ?? ""}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={OTHER_SOURCE}>Other (manually entered)</option>
        </Select>
      </div>

      {showStatusFilters && (
        <>
          <div>
            <label className={labelClass} htmlFor="f-job-status">
              Job status
            </label>
            <Select
              id="f-job-status"
              name="jobStatus"
              defaultValue={current.jobStatus ?? ""}
            >
              <option value="">All job statuses</option>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-sub-status">
              Submission status
            </label>
            <Select
              id="f-sub-status"
              name="submissionStatus"
              defaultValue={current.submissionStatus ?? ""}
            >
              <option value="">All submission statuses</option>
              {SUBMISSION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SUBMISSION_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </>
      )}

      <div>
        <label className={labelClass} htmlFor="f-from">
          From (custom range)
        </label>
        <Input id="f-from" name="from" type="date" defaultValue={current.from ?? ""} />
      </div>

      <div>
        <label className={labelClass} htmlFor="f-to">
          To (custom range)
        </label>
        <Input id="f-to" name="to" type="date" defaultValue={current.to ?? ""} />
      </div>
    </>
  );

  return (
    <FilterBar
      basePath={basePath}
      primary={primary}
      advanced={advanced}
      advancedActiveCount={advancedActiveCount}
      chips={chips}
    />
  );
}
