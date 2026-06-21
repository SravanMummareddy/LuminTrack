"use client";

import { FilterBar, type FilterChip } from "@/components/ui/filter-bar";
import { DateRangeField } from "@/components/ui/date-range-field";
import { Select } from "@/components/ui/field";
import { PLACEMENT_STATUSES, PLACEMENT_STATUS_LABEL } from "@/lib/labels";

const labelClass = "mb-1 block text-xs font-medium text-slate-600";

type Current = {
  q?: string;
  status?: string;
  clientId?: string;
  recruiterId?: string;
  preset?: string;
  from?: string;
  to?: string;
};

export function PlacementsFilters({
  current,
  clients,
  recruiters,
}: {
  current: Current;
  clients: { id: string; name: string }[];
  recruiters: { id: string; fullName: string }[];
}) {
  const clientName = clients.find((c) => c.id === current.clientId)?.name;
  const recruiterName = recruiters.find((r) => r.id === current.recruiterId)?.fullName;

  const chips: FilterChip[] = [];
  if (clientName) chips.push({ keys: ["clientId"], label: `Client: ${clientName}` });
  if (recruiterName) chips.push({ keys: ["recruiterId"], label: `Recruiter: ${recruiterName}` });
  if (current.preset && current.preset !== "all")
    chips.push({ keys: ["preset", "from", "to"], label: "Started: filtered" });

  const advancedActiveCount =
    (current.clientId ? 1 : 0) + (current.recruiterId ? 1 : 0);

  return (
    <FilterBar
      basePath="/placements"
      search={{ name: "q", defaultValue: current.q, placeholder: "Candidate or job…" }}
      advancedActiveCount={advancedActiveCount}
      chips={chips}
      primary={
        <>
          <div className="sm:w-44">
            <label className={labelClass} htmlFor="f-status">
              Status
            </label>
            <Select id="f-status" name="status" defaultValue={current.status ?? "ACTIVE"}>
              <option value="all">All statuses</option>
              {PLACEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PLACEMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <DateRangeField
            label="Started"
            preset={current.preset}
            from={current.from}
            to={current.to}
          />
        </>
      }
      advanced={
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
            <label className={labelClass} htmlFor="f-recruiter">
              Recruiter
            </label>
            <Select id="f-recruiter" name="recruiterId" defaultValue={current.recruiterId ?? ""}>
              <option value="">All recruiters</option>
              {recruiters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </Select>
          </div>
        </>
      }
    />
  );
}
