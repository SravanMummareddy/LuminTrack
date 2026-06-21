import { Input, Select } from "@/components/ui/field";
import { FilterBar, type FilterChip } from "@/components/ui/filter-bar";
import { DATE_PRESETS } from "@/lib/filters";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/**
 * Candidate list filter bar. A plain GET form rendered through the shared
 * FilterBar: name + skill stay visible, the rest collapse behind "Filters".
 */
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
    status?: string;
    preset?: string;
    from?: string;
    to?: string;
  };
}) {
  const presetLabel =
    current.preset && current.preset !== "all"
      ? DATE_PRESETS.find((p) => p.value === current.preset)?.label
      : undefined;

  const chips: FilterChip[] = [];
  if (current.skill)
    chips.push({ keys: ["skill"], label: `Skill: ${current.skill}` });
  if (current.location)
    chips.push({ keys: ["location"], label: `Location: ${current.location}` });
  if (current.workAuthorization)
    chips.push({
      keys: ["workAuthorization"],
      label: `Work auth: ${current.workAuthorization}`,
    });
  if (current.currentCompany)
    chips.push({
      keys: ["currentCompany"],
      label: `Company: ${current.currentCompany}`,
    });
  if (current.minExperience)
    chips.push({
      keys: ["minExperience"],
      label: `Min exp: ${current.minExperience} yrs`,
    });
  if (current.status === "active" || current.status === "inactive")
    chips.push({
      keys: ["status"],
      label: `Status: ${current.status === "active" ? "Active" : "Inactive"}`,
    });
  if (presetLabel)
    chips.push({ keys: ["preset", "from", "to"], label: `Date: ${presetLabel}` });

  const advancedActiveCount =
    (current.location ? 1 : 0) +
    (current.workAuthorization ? 1 : 0) +
    (current.currentCompany ? 1 : 0) +
    (current.minExperience ? 1 : 0) +
    (current.status ? 1 : 0) +
    (presetLabel ? 1 : 0);

  const primary = (
    <>
      <div className="sm:w-44">
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
        <label className={labelClass} htmlFor="f-status">
          Status
        </label>
        <Select id="f-status" name="status" defaultValue={current.status ?? ""}>
          <option value="">All candidates</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
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
      basePath="/candidates"
      search={{ name: "q", defaultValue: current.q, placeholder: "Search candidate name…" }}
      primary={primary}
      advanced={advanced}
      advancedActiveCount={advancedActiveCount}
      chips={chips}
    />
  );
}
