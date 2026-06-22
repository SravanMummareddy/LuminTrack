"use client";

import { useState } from "react";
import { DATE_PRESETS } from "@/lib/filters";
import { Input, Select } from "@/components/ui/field";

const labelClass = "mb-1 block text-xs font-medium text-slate-600";

/**
 * A date-range filter control shared by every list page. Renders a preset
 * dropdown (Today / Last 7 days / … / Custom range); choosing **Custom range**
 * reveals From / To date inputs inline, right next to the preset — no need to
 * dig into an advanced panel. The server reads `preset` + `from` + `to` via
 * `parseDateRange()` (src/lib/filters.ts), so the inputs stay plain form fields.
 */
export function DateRangeField({
  label = "Date range",
  preset,
  from,
  to,
}: {
  label?: string;
  preset?: string;
  from?: string;
  to?: string;
}) {
  const [value, setValue] = useState(preset && preset.length ? preset : "all");
  const custom = value === "custom";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-44">
        <label className={labelClass} htmlFor="f-preset">
          {label}
        </label>
        <Select
          id="f-preset"
          name="preset"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      {custom && (
        <>
          <div className="sm:w-40">
            <label className={labelClass} htmlFor="f-from">
              From
            </label>
            <Input id="f-from" type="date" name="from" defaultValue={from ?? ""} />
          </div>
          <div className="sm:w-40">
            <label className={labelClass} htmlFor="f-to">
              To
            </label>
            <Input id="f-to" type="date" name="to" defaultValue={to ?? ""} />
          </div>
        </>
      )}
    </div>
  );
}
