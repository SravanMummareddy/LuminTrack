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
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
function parse(s?: string): Date | null {
  return s ? parseISO(s) : null;
}

/** "Jul 6 – Jul 20, 2026" / "Jul 6, 2026" / "From Jul 6, 2026". */
export function formatRangeLabel(from?: string, to?: string): string {
  const f = parse(from);
  const t = parse(to);
  if (f && t) {
    const sameYear = f.getFullYear() === t.getFullYear();
    return `${format(f, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(t, "MMM d, yyyy")}`;
  }
  if (f) return `From ${format(f, "MMM d, yyyy")}`;
  if (t) return `Until ${format(t, "MMM d, yyyy")}`;
  return "Pick a start and end date";
}

/**
 * A branded single-month range calendar, replacing the native `<input
 * type="date">` popups (which render the un-styled OS calendar with no confirm
 * and can't match the app). Click a start day, then an end day — page across
 * months with the arrows to build a range that spans any number of months. The
 * selection stays highlighted while navigating. Parent owns `from`/`to` as
 * `yyyy-MM-dd` strings (what `parseDateRange` reads) and applies on its own
 * button, so this control never navigates by itself.
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
  const fromD = parse(from);
  const toD = parse(to);
  const [month, setMonth] = useState<Date>(
    startOfMonth(fromD ?? new Date()),
  );
  const [hover, setHover] = useState<Date | null>(null);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // While a start is chosen but no end yet, preview the range under the cursor.
  const previewEnd = fromD && !toD ? hover : toD;

  function inRange(d: Date): boolean {
    if (!fromD || !previewEnd) return false;
    const lo = isBefore(previewEnd, fromD) ? previewEnd : fromD;
    const hi = isBefore(previewEnd, fromD) ? fromD : previewEnd;
    return !isBefore(d, lo) && !isAfter(d, hi);
  }

  function pick(d: Date): void {
    // Fresh selection when nothing is started or a full range already exists.
    if (!fromD || (fromD && toD)) {
      onChange(toKey(d), null);
      return;
    }
    // A start exists, no end: clicking before it flips the pair so from ≤ to.
    if (isBefore(d, fromD)) onChange(toKey(d), toKey(fromD));
    else onChange(toKey(fromD), toKey(d));
  }

  return (
    <div className="w-64" onMouseLeave={() => setHover(null)}>
      <div className="mb-1 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          className="rounded p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-slate-800">
          {format(month, "MMMM yyyy")}
        </span>
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
                          "rounded-full",
                          muted ? "text-slate-300" : "text-slate-700",
                          "hover:bg-slate-100",
                        ),
                )}
              >
                {format(d, "d")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
