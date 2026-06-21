"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
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
        <div className="relative">
          <CalendarRange className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Select
            id="f-preset"
            name="preset"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pl-8"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
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
