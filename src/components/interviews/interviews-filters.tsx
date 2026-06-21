"use client";

import { FilterBar, type FilterChip } from "@/components/ui/filter-bar";
import { DateRangeField } from "@/components/ui/date-range-field";
import { Select } from "@/components/ui/field";

const labelClass = "mb-1 block text-xs font-medium text-slate-600";

type Current = {
  q?: string;
  recruiterId?: string;
  preset?: string;
  from?: string;
  to?: string;
};

export function InterviewsFilters({
  current,
  recruiters,
}: {
  current: Current;
  recruiters: { id: string; fullName: string }[];
}) {
  const recruiterName = recruiters.find((r) => r.id === current.recruiterId)?.fullName;

  const chips: FilterChip[] = [];
  if (recruiterName) chips.push({ keys: ["recruiterId"], label: `Recruiter: ${recruiterName}` });
  if (current.preset && current.preset !== "all")
    chips.push({ keys: ["preset", "from", "to"], label: "Interview date: filtered" });

  return (
    <FilterBar
      basePath="/interviews"
      search={{ name: "q", defaultValue: current.q, placeholder: "Candidate, job, or client…" }}
      advancedActiveCount={current.recruiterId ? 1 : 0}
      chips={chips}
      primary={
        <DateRangeField
          label="Interview date"
          preset={current.preset}
          from={current.from}
          to={current.to}
        />
      }
      advanced={
        <div>
          <label className={labelClass} htmlFor="f-recruiter">
            Sales recruiter
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
      }
    />
  );
}
