"use client";

import { FilterBar, type FilterChip } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/field";
import {
  BENCH_PRIORITIES,
  BENCH_PRIORITY_LABEL,
  BENCH_MARKETING_STATUSES,
  BENCH_MARKETING_STATUS_LABEL,
} from "@/lib/labels";

const labelClass = "mb-1 block text-xs font-medium text-slate-600";

type Current = {
  q?: string;
  priority?: string;
  status?: string; // "onbench" | "all" | a BenchMarketingStatus
  recruiterId?: string;
};

export function BenchFilters({
  current,
  recruiters,
}: {
  current: Current;
  recruiters: { id: string; fullName: string }[];
}) {
  const recruiterName = recruiters.find((r) => r.id === current.recruiterId)?.fullName;
  const priorityLabel = BENCH_PRIORITIES.includes(current.priority as never)
    ? BENCH_PRIORITY_LABEL[current.priority as never]
    : undefined;

  const chips: FilterChip[] = [];
  if (priorityLabel) chips.push({ keys: ["priority"], label: `Priority: ${priorityLabel}` });
  if (recruiterName) chips.push({ keys: ["recruiterId"], label: `Recruiter: ${recruiterName}` });

  return (
    <FilterBar
      basePath="/bench"
      search={{ name: "q", defaultValue: current.q, placeholder: "Name, technology, location…" }}
      advancedActiveCount={current.recruiterId ? 1 : 0}
      chips={chips}
      primary={
        <>
          <div className="sm:w-40">
            <label className={labelClass} htmlFor="f-priority">
              Priority
            </label>
            <Select id="f-priority" name="priority" defaultValue={current.priority ?? ""}>
              <option value="">All</option>
              {BENCH_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {BENCH_PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-52">
            <label className={labelClass} htmlFor="f-status">
              Marketing status
            </label>
            <Select id="f-status" name="status" defaultValue={current.status ?? "onbench"}>
              <option value="onbench">On bench (Active + Paused)</option>
              <option value="all">All</option>
              {BENCH_MARKETING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BENCH_MARKETING_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </>
      }
      advanced={
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
      }
    />
  );
}
