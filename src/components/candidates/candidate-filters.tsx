import Link from "next/link";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { DATE_PRESETS } from "@/lib/filters";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/** Candidate list filter bar — a plain GET form, no client-side JavaScript. */
export function CandidateFilters({
  current,
}: {
  current: {
    q?: string;
    skill?: string;
    location?: string;
    workAuthorization?: string;
    currentCompany?: string;
    minExperience?: string;
    preset?: string;
    from?: string;
    to?: string;
  };
}) {
  return (
    <form className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="f-q">
            Search name
          </label>
          <Input
            id="f-q"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Candidate name"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="f-skill">
            Skill
          </label>
          <Input
            id="f-skill"
            name="skill"
            defaultValue={current.skill ?? ""}
            placeholder="e.g. React"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="f-location">
            Location
          </label>
          <Input
            id="f-location"
            name="location"
            defaultValue={current.location ?? ""}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="f-workauth">
            Work authorization
          </label>
          <Input
            id="f-workauth"
            name="workAuthorization"
            defaultValue={current.workAuthorization ?? ""}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="f-company">
            Current company
          </label>
          <Input
            id="f-company"
            name="currentCompany"
            defaultValue={current.currentCompany ?? ""}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="f-exp">
            Min. experience (yrs)
          </label>
          <Input
            id="f-exp"
            name="minExperience"
            type="number"
            min="0"
            step="0.1"
            defaultValue={current.minExperience ?? ""}
          />
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
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className={buttonClass("primary", "sm")}>
          <Search className="h-4 w-4" />
          Apply filters
        </button>
        <Link href="/candidates" className={buttonClass("secondary", "sm")}>
          Clear
        </Link>
      </div>
    </form>
  );
}
