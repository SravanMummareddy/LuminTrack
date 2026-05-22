import Link from "next/link";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { DATE_PRESETS } from "@/lib/filters";
import { SUBMISSION_STATUSES, SUBMISSION_STATUS_LABEL } from "@/lib/labels";

type Option = { id: string; name: string };

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/**
 * Submissions list filter bar. A plain GET form — submitting reloads
 * `/submissions` with the chosen filters as URL search params.
 */
export function SubmissionFilters({
  current,
  clients,
  vendors,
  sources,
  recruiters,
}: {
  current: {
    q?: string;
    status?: string;
    recruiterId?: string;
    clientId?: string;
    vendorId?: string;
    sisterCompanySourceId?: string;
    preset?: string;
    from?: string;
    to?: string;
  };
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  recruiters: { id: string; fullName: string }[];
}) {
  return (
    <form className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="f-q">
            Search candidate or job
          </label>
          <Input
            id="f-q"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Candidate name or job title"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="f-status">
            Status
          </label>
          <Select id="f-status" name="status" defaultValue={current.status ?? ""}>
            <option value="">All statuses</option>
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBMISSION_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className={labelClass} htmlFor="f-recruiter">
            Submitted by
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
            Sister company source
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
          </Select>
        </div>

        <div>
          <label className={labelClass} htmlFor="f-preset">
            Submitted date
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
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className={buttonClass("primary", "sm")}>
          <Search className="h-4 w-4" />
          Apply filters
        </button>
        <Link href="/submissions" className={buttonClass("secondary", "sm")}>
          Clear
        </Link>
      </div>
    </form>
  );
}
