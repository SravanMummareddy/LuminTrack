import { Input, Select } from "@/components/ui/field";
import { FilterBar, type FilterChip } from "@/components/ui/filter-bar";
import { DATE_PRESETS } from "@/lib/filters";
import { JOB_STATUSES, JOB_STATUS_LABEL, OTHER_SOURCE } from "@/lib/labels";
import type { JobStatus } from "@/generated/prisma/enums";

type Option = { id: string; name: string };

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/**
 * Job list filter bar. A plain GET form rendered through the shared FilterBar:
 * search + status stay visible, the rest collapse behind the "Filters" toggle.
 */
export function JobFilters({
  current,
  clients,
  vendors,
  sources,
  recruiters,
}: {
  current: {
    q?: string;
    clientId?: string;
    vendorId?: string;
    sisterCompanySourceId?: string;
    recruiterId?: string;
    status?: string;
    location?: string;
    preset?: string;
    from?: string;
    to?: string;
  };
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  recruiters: { id: string; fullName: string }[];
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
  if (current.status)
    chips.push({
      keys: ["status"],
      label: `Status: ${JOB_STATUS_LABEL[current.status as JobStatus] ?? current.status}`,
    });
  if (current.location)
    chips.push({ keys: ["location"], label: `Location: ${current.location}` });
  if (clientName)
    chips.push({ keys: ["clientId"], label: `Client: ${clientName}` });
  if (vendorName)
    chips.push({ keys: ["vendorId"], label: `Vendor: ${vendorName}` });
  if (sourceName)
    chips.push({
      keys: ["sisterCompanySourceId"],
      label: `Source: ${sourceName}`,
    });
  if (recruiterName)
    chips.push({ keys: ["recruiterId"], label: `Recruiter: ${recruiterName}` });
  if (presetLabel)
    chips.push({ keys: ["preset", "from", "to"], label: `Date: ${presetLabel}` });

  const advancedActiveCount =
    (current.location ? 1 : 0) +
    (current.clientId ? 1 : 0) +
    (current.vendorId ? 1 : 0) +
    (current.sisterCompanySourceId ? 1 : 0) +
    (current.recruiterId ? 1 : 0) +
    (presetLabel ? 1 : 0);

  const primary = (
    <>
      <div className="sm:w-44">
        <label className={labelClass} htmlFor="f-status">
          Status
        </label>
        <Select id="f-status" name="status" defaultValue={current.status ?? ""}>
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
    </>
  );

  const advanced = (
    <>
      <div>
        <label className={labelClass} htmlFor="f-location">
          Location
        </label>
        <Input
          id="f-location"
          name="location"
          defaultValue={current.location ?? ""}
          placeholder="e.g. Remote"
        />
      </div>

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

      <div>
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

      <div>
        <label className={labelClass} htmlFor="f-preset">
          Date added
        </label>
        <Select id="f-preset" name="preset" defaultValue={current.preset ?? "all"}>
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

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
      basePath="/jobs"
      search={{ name: "q", defaultValue: current.q, placeholder: "Search job title…" }}
      primary={primary}
      advanced={advanced}
      advancedActiveCount={advancedActiveCount}
      chips={chips}
    />
  );
}
