"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Hand, Check, Keyboard } from "lucide-react";
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
/** The chip label — "Jul 6, 2026" or the placeholder. */
function toChip(d: Date | null, placeholder: string): string {
  return d ? format(d, "MMM d, yyyy") : placeholder;
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

const jumpCls =
  "rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400";
const typedFieldCls =
  "mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400";

/**
 * A branded, calendar-first date-range picker. The Start / End values show as
 * read-only chips that fill in as you click the grid — the chip you're about to
 * set is highlighted, and a guided line tells you the next step. Clicking a chip
 * re-targets that end. Typing is still available behind "Type dates instead" for
 * power users. Month + year dropdowns (plus arrows) jump across months.
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
  // Which endpoint the next calendar click sets — drives the chip highlight and
  // the guided helper. Starts on "start" and flips to "end" after the first pick.
  const [picking, setPicking] = useState<"start" | "end">(
    fromD && !toD ? "end" : "start",
  );
  const [showTyping, setShowTyping] = useState(false);
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

  // Live preview while anchoring the end (fresh range, or editing the end chip).
  const anchoringEnd = Boolean(fromD) && (picking === "end" || !toD);
  const previewEnd = anchoringEnd ? (hover ?? toD) : toD;
  function inRange(d: Date): boolean {
    if (!fromD || !previewEnd) return false;
    const lo = isBefore(previewEnd, fromD) ? previewEnd : fromD;
    const hi = isBefore(previewEnd, fromD) ? fromD : previewEnd;
    return !isBefore(d, lo) && !isAfter(d, hi);
  }

  function commit(nf: Date | null, nt: Date | null): void {
    onChange(nf ? toKey(nf) : null, nt ? toKey(nt) : null);
    setStartText(toInput(nf));
    setEndText(toInput(nt));
  }

  function pick(d: Date): void {
    if (picking === "end" && fromD) {
      // Setting the end — keep the start, swap if they clicked before it.
      if (isBefore(d, fromD)) commit(d, fromD);
      else commit(fromD, d);
      setPicking("start");
      return;
    }
    // Setting the start. If an end already exists and the pick is on/before it,
    // keep the end; otherwise start a fresh range and move on to the end.
    if (toD && !isAfter(d, toD)) {
      commit(d, toD);
      setPicking("start");
    } else {
      commit(d, null);
      setPicking("end");
    }
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
    setPicking("start");
    setMonth(startOfMonth(new Date()));
  }

  const helper = !fromD
    ? { icon: <Hand className="h-3.5 w-3.5" />, text: "Click a start date", tone: "text-indigo-600" }
    : !toD
      ? { icon: <Hand className="h-3.5 w-3.5" />, text: "Now click an end date", tone: "text-indigo-600" }
      : { icon: <Check className="h-3.5 w-3.5" />, text: "Range selected — adjust or apply", tone: "text-emerald-600" };

  return (
    <div className="w-64" onMouseLeave={() => setHover(null)}>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setPicking("start")}
          className={cn(
            "flex-1 rounded-md border px-2.5 py-1.5 text-left transition",
            picking === "start"
              ? "border-indigo-500 bg-indigo-50"
              : "border-slate-200 bg-white hover:border-slate-300",
          )}
        >
          <span className="block text-[11px] font-medium text-slate-500">
            Start
          </span>
          <span
            className={cn(
              "block text-sm",
              fromD ? "text-slate-800" : "text-slate-400",
            )}
          >
            {toChip(fromD, "Select start")}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setPicking("end")}
          className={cn(
            "flex-1 rounded-md border px-2.5 py-1.5 text-left transition",
            picking === "end"
              ? "border-indigo-500 bg-indigo-50"
              : "border-slate-200 bg-white hover:border-slate-300",
          )}
        >
          <span className="block text-[11px] font-medium text-slate-500">
            End
          </span>
          <span
            className={cn(
              "block text-sm",
              toD ? "text-slate-800" : "text-slate-400",
            )}
          >
            {toChip(toD, "Select end")}
          </span>
        </button>
      </div>

      <p
        className={cn(
          "mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-medium",
          helper.tone,
        )}
      >
        {helper.icon}
        {helper.text}
      </p>

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

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
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
            Boolean(anchoringEnd && hover && isSameDay(d, hover));
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
                  "flex h-9 w-9 items-center justify-center text-sm",
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

      <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setShowTyping((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
        >
          <Keyboard className="h-3.5 w-3.5" />
          {showTyping ? "Hide typing" : "Type dates instead"}
        </button>
        {(from || to) && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        )}
      </div>

      {showTyping && (
        <div className="mt-2 flex items-end gap-2 border-t border-slate-100 pt-2">
          <label className="flex-1 text-[11px] font-medium text-slate-500">
            Start
            <input
              value={startText}
              onChange={(e) => typeStart(e.target.value)}
              placeholder="mm/dd/yyyy"
              inputMode="numeric"
              className={typedFieldCls}
            />
          </label>
          <label className="flex-1 text-[11px] font-medium text-slate-500">
            End
            <input
              value={endText}
              onChange={(e) => typeEnd(e.target.value)}
              placeholder="mm/dd/yyyy"
              inputMode="numeric"
              className={typedFieldCls}
            />
          </label>
        </div>
      )}
    </div>
  );
}
