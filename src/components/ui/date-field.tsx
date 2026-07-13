"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { format, parseISO, isValid } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shared date / date-time picker built on react-day-picker — replaces the native
 * `datetime-local` / `date` inputs whose calendar popup is OS-drawn, inconsistent
 * across browsers, and (per owner review) breaks visually. Mirrors the custom
 * `Select` (`select-menu.tsx`): a styled trigger, a click-outside popover, and a
 * hidden input so it drops into the existing FormData / server-action forms. It
 * dispatches a bubbling `input` event on the hidden field so the forms'
 * unsaved-changes dirty guard notices a pick (same trick as Select/SearchSelect).
 *
 * Submitted value:
 *   • `DateField`     → `yyyy-MM-dd` (date-only, matches the old `type="date"`).
 *   • `DateTimeField` → a full ISO instant (`toISOString()`), so a wall-clock time
 *     stored + re-parsed on the server (UTC on Vercel) keeps the right moment —
 *     the same reason `interview-round-form` posted ISO from a hidden input.
 *
 * Controlled (`value` + `onChange(nextValue)`) or uncontrolled (`defaultValue`).
 */
type BaseProps = {
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** yyyy-MM-dd bounds — days before `min` / after `max` are unselectable
   *  (mirrors the native input's min/max, e.g. receivedAt's "no future" guard). */
  min?: string;
  max?: string;
  "aria-label"?: string;
};

function parseValue(v: string | undefined, withTime: boolean): Date | undefined {
  if (!v) return undefined;
  // Date-only strings ("2026-07-18") parse to LOCAL midnight via parseISO; a full
  // ISO instant parses through the Date ctor. Guard against garbage.
  const d = withTime ? new Date(v) : parseISO(v.length > 10 ? v.slice(0, 10) : v);
  return isValid(d) ? d : undefined;
}

function BaseDateField({
  name,
  id,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  placeholder,
  className,
  min,
  max,
  withTime,
  "aria-label": ariaLabel,
}: BaseProps & { withTime: boolean }) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string>(defaultValue ?? "");
  const current = isControlled ? value : internal;
  const date = parseValue(current, withTime);

  const [time, setTime] = useState<string>(
    date && withTime ? format(date, "HH:mm") : "",
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function emit(next: string) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
    // Fire a bubbling input event so a form-level onInput dirty guard sees the
    // change (React state on the hidden input alone emits no native event).
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function pickDay(day: Date | undefined) {
    if (!day) return;
    if (withTime) {
      const t = time || "09:00";
      if (!time) setTime(t);
      const [h, m] = t.split(":").map(Number);
      const dt = new Date(day);
      dt.setHours(h, m, 0, 0);
      emit(dt.toISOString());
    } else {
      emit(format(day, "yyyy-MM-dd"));
      setOpen(false);
    }
  }

  function changeTime(t: string) {
    setTime(t);
    if (date && t) {
      const [h, m] = t.split(":").map(Number);
      const dt = new Date(date);
      dt.setHours(h, m, 0, 0);
      emit(dt.toISOString());
    }
  }

  const display = date
    ? withTime
      ? format(date, "MMM d, yyyy, h:mm a")
      : format(date, "MMM d, yyyy")
    : "";

  const disabledDays: Matcher[] = [];
  if (min) disabledDays.push({ before: parseISO(min) });
  if (max) disabledDays.push({ after: parseISO(max) });

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        value={current}
        required={required}
      />
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500",
          className,
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
        <span className={cn("flex-1 truncate", !display && "text-slate-400")}>
          {display || placeholder || (withTime ? "Select date & time" : "Select date")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="rdp-pop absolute z-30 mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={pickDay}
            defaultMonth={date}
            showOutsideDays
            disabled={disabledDays.length ? disabledDays : undefined}
          />
          {withTime && (
            <div className="flex items-center gap-2 border-t border-slate-100 px-2 py-2">
              <label className="text-xs font-medium text-slate-500">Time</label>
              <TimeSelect value={time} onChange={changeTime} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

/** 12-hour hour/minute/AM-PM selects, replacing the native `type="time"` (owner
 *  found it clunky). Value is "HH:mm" (24h) in/out, so `changeTime` is unchanged.
 *  ponytail: minutes snap to 5s; a stored off-step minute is kept as an extra option. */
function TimeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (t: string) => void;
}) {
  const [hh, mm] = value ? value.split(":").map(Number) : [NaN, NaN];
  const has = !Number.isNaN(hh);
  const h12 = has ? String(((hh + 11) % 12) + 1) : "";
  const ap = has && hh >= 12 ? "PM" : "AM";
  const min = has ? String(mm).padStart(2, "0") : "";
  const minuteOpts = min && !MINUTES.includes(min) ? [min, ...MINUTES] : MINUTES;

  const build = (nh12: string, nmin: string, nap: string) => {
    if (!nh12) return;
    const h = (Number(nh12) % 12) + (nap === "PM" ? 12 : 0);
    onChange(`${String(h).padStart(2, "0")}:${nmin || "00"}`);
  };

  const sel =
    "rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Hour"
        className={sel}
        value={h12}
        onChange={(e) => build(e.target.value, min, ap)}
      >
        <option value="" disabled>
          hh
        </option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-slate-400">:</span>
      <select
        aria-label="Minute"
        className={sel}
        value={min}
        onChange={(e) => build(h12, e.target.value, ap)}
      >
        <option value="" disabled>
          mm
        </option>
        {minuteOpts.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label="AM/PM"
        className={sel}
        value={ap}
        onChange={(e) => build(h12, min, e.target.value)}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export function DateField(props: BaseProps) {
  return <BaseDateField {...props} withTime={false} />;
}

export function DateTimeField(props: BaseProps) {
  return <BaseDateField {...props} withTime={true} />;
}
