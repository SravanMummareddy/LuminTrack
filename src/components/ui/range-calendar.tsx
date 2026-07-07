"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isValid,
  parse as parseFmt,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2000, i, 1), "MMMM"),
);

function toKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
function fromIso(s?: string): Date | null {
  return s ? parseISO(s) : null;
}
/** The value shown in the typed fields. */
function toInput(d: Date | null): string {
  return d ? format(d, "MM/dd/yyyy") : "";
}
/** Forgiving parse of what the user typed — several common formats, but only
 *  once enough characters exist to be a real date (avoids committing "1/1/1"). */
function tryParseTyped(v: string): Date | null {
  const s = v.trim();
  if (s.length < 8) return null;
  for (const f of ["MM/dd/yyyy", "M/d/yyyy", "yyyy-MM-dd"]) {
    const d = parseFmt(s, f, new Date());
    if (isValid(d)) return d;
  }
  return null;
}

/** "Jul 6 – Jul 20, 2026" / "From Jul 6, 2026". */
export function formatRangeLabel(from?: string, to?: string): string {
  const f = fromIso(from);
  const t = fromIso(to);
  if (f && t) {
    const sameYear = f.getFullYear() === t.getFullYear();
    return `${format(f, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(t, "MMM d, yyyy")}`;
  }
  if (f) return `From ${format(f, "MMM d, yyyy")}`;
  if (t) return `Until ${format(t, "MMM d, yyyy")}`;
  return "Pick a start and end date";
}

const fieldCls =
  "mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400";
const jumpCls =
  "rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400";

/**
 * A branded date-range picker: type into the Start / End fields OR pick on the
 * calendar — the two stay in sync. Month + year dropdowns (plus arrows) jump
 * across months so a multi-month range is a couple of clicks, not arrow-mashing.
 * Replaces the native `<input type="date">` OS calendar (un-styled, no confirm).
 * Parent owns `from`/`to` as `yyyy-MM-dd` strings and applies on its own button.
 */
export function RangeCalendar({
  from,
  to,
  onChange,
}: {
  from?: string;
  to?: string;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const fromD = fromIso(from);
  const toD = fromIso(to);
  const [month, setMonth] = useState<Date>(startOfMonth(fromD ?? new Date()));
  const [hover, setHover] = useState<Date | null>(null);
  // The typed fields hold their own text so half-finished input isn't discarded;
  // a valid parse commits up to `onChange`, and calendar clicks write back here.
  const [startText, setStartText] = useState(() => toInput(fromD));
  const [endText, setEndText] = useState(() => toInput(toD));

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear - 10; y <= thisYear + 1; y++) years.push(y);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const previewEnd = fromD && !toD ? hover : toD;
  function inRange(d: Date): boolean {
    if (!fromD || !previewEnd) return false;
    const lo = isBefore(previewEnd, fromD) ? previewEnd : fromD;
    const hi = isBefore(previewEnd, fromD) ? fromD : previewEnd;
    return !isBefore(d, lo) && !isAfter(d, hi);
  }

  function pick(d: Date): void {
    let nf: Date | null;
    let nt: Date | null;
    if (!fromD || (fromD && toD)) {
      nf = d;
      nt = null;
    } else if (isBefore(d, fromD)) {
      nf = d;
      nt = fromD;
    } else {
      nf = fromD;
      nt = d;
    }
    onChange(nf ? toKey(nf) : null, nt ? toKey(nt) : null);
    setStartText(toInput(nf));
    setEndText(toInput(nt));
  }

  function typeStart(v: string): void {
    setStartText(v);
    const d = tryParseTyped(v);
    if (d) {
      onChange(toKey(d), toD ? toKey(toD) : null);
      setMonth(startOfMonth(d));
    }
  }
  function typeEnd(v: string): void {
    setEndText(v);
    const d = tryParseTyped(v);
    if (d) {
      onChange(fromD ? toKey(fromD) : null, toKey(d));
      setMonth(startOfMonth(d));
    }
  }
  function clear(): void {
    onChange(null, null);
    setStartText("");
    setEndText("");
    setMonth(startOfMonth(new Date()));
  }

  return (
    <div className="w-64" onMouseLeave={() => setHover(null)}>
      <div className="mb-2 flex items-end gap-2">
        <label className="flex-1 text-[11px] font-medium text-slate-500">
          Start
          <input
            value={startText}
            onChange={(e) => typeStart(e.target.value)}
            placeholder="mm/dd/yyyy"
            inputMode="numeric"
            className={fieldCls}
          />
        </label>
        <label className="flex-1 text-[11px] font-medium text-slate-500">
          End
          <input
            value={endText}
            onChange={(e) => typeEnd(e.target.value)}
            placeholder="mm/dd/yyyy"
            inputMode="numeric"
            className={fieldCls}
          />
        </label>
      </div>

      <div className="mb-1 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          className="rounded p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex gap-1">
          <select
            value={month.getMonth()}
            onChange={(e) =>
              setMonth(new Date(month.getFullYear(), Number(e.target.value), 1))
            }
            className={jumpCls}
            aria-label="Month"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={month.getFullYear()}
            onChange={(e) =>
              setMonth(new Date(Number(e.target.value), month.getMonth(), 1))
            }
            className={jumpCls}
            aria-label="Year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          className="rounded p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-1 text-center text-[11px] font-medium text-slate-400"
          >
            {w}
          </div>
        ))}
        {days.map((d) => {
          const muted = !isSameMonth(d, month);
          const isEndpoint =
            (fromD && isSameDay(d, fromD)) ||
            (toD && isSameDay(d, toD)) ||
            Boolean(fromD && !toD && hover && isSameDay(d, hover));
          const ranged = inRange(d) && !isEndpoint;
          return (
            <div
              key={toKey(d)}
              className={cn("flex justify-center", ranged && "bg-indigo-50")}
            >
              <button
                type="button"
                onMouseEnter={() => setHover(d)}
                onClick={() => pick(d)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center text-sm",
                  isEndpoint
                    ? "rounded-full bg-indigo-600 font-medium text-white"
                    : ranged
                      ? "text-indigo-700"
                      : cn(
                          "rounded-full hover:bg-slate-100",
                          muted ? "text-slate-300" : "text-slate-700",
                        ),
                )}
              >
                {format(d, "d")}
              </button>
            </div>
          );
        })}
      </div>

      {(from || to) && (
        <div className="mt-1 text-right">
          <button
            type="button"
            onClick={clear}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
