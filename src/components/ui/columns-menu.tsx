"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  SlidersHorizontal,
} from "lucide-react";
import type { ColumnPrefs } from "@/lib/use-column-prefs";

/** Minimal column descriptor the menu cares about. */
type ColumnInfo = { key: string; label: string };

/**
 * Generic column show/hide + reorder menu. Hosts the shared logic that used
 * to be duplicated across JobsTable / CandidatesTable / SubmissionsTable.
 *
 * Supports two reorder paths:
 *   • drag-and-drop (mouse) on the grip handle
 *   • ↑ / ↓ buttons (keyboard) next to each row
 *
 * The caller owns the column registry and visibility defaults; this menu just
 * mutates `prefs` and bubbles it back.
 */
export function ColumnsMenu({
  columns,
  prefs,
  onChange,
  defaults,
  disabled,
}: {
  /** Columns in their CURRENT order (caller is expected to pass `prefs.order` already resolved). */
  columns: ColumnInfo[];
  prefs: ColumnPrefs;
  onChange: (next: ColumnPrefs) => void;
  defaults: ColumnPrefs;
  /** Optional. Callers used to pass `!hydrated` here to gate the menu until
   *  localStorage prefs loaded, but the menu works correctly with the
   *  default prefs pre-hydration — disabling it just produced a confusing
   *  "Columns" button that briefly appeared inert on every list render. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggleVisible(key: string) {
    const set = new Set(prefs.visible);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    // Preserve original column order in the `visible` array for determinism.
    const visible = prefs.order.filter((k) => set.has(k));
    onChange({ ...prefs, visible });
  }

  function moveTo(srcKey: string, dstKey: string) {
    if (srcKey === dstKey) return;
    const order = prefs.order.filter((k) => k !== srcKey);
    const dstIdx = order.indexOf(dstKey);
    order.splice(dstIdx, 0, srcKey);
    onChange({ ...prefs, order });
  }

  function moveBy(key: string, delta: -1 | 1) {
    const idx = prefs.order.indexOf(key);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= prefs.order.length) return;
    const order = [...prefs.order];
    [order[idx], order[target]] = [order[target], order[idx]];
    onChange({ ...prefs, order });
  }

  function reset() {
    onChange(defaults);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Columns
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1 py-1 text-xs text-slate-500">
            <span>
              <span className="hidden sm:inline">Drag, use </span>
              <span className="sm:hidden">Use </span>
              ↑↓, or toggle to show
            </span>
            <button
              type="button"
              onClick={reset}
              className="text-indigo-600 hover:underline"
            >
              Reset
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {columns.map((c, idx) => {
              const isVisible = prefs.visible.includes(c.key);
              const isDragging = dragKey === c.key;
              const isFirst = idx === 0;
              const isLast = idx === columns.length - 1;
              return (
                <li
                  key={c.key}
                  draggable
                  onDragStart={() => setDragKey(c.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragKey) moveTo(dragKey, c.key);
                    setDragKey(null);
                  }}
                  onDragEnd={() => setDragKey(null)}
                  className={
                    "flex items-center gap-1 rounded px-1 py-1 text-sm " +
                    (isDragging ? "opacity-40" : "hover:bg-slate-50")
                  }
                >
                  <GripVertical
                    className="hidden h-4 w-4 shrink-0 cursor-grab text-slate-400 sm:block"
                    aria-hidden
                  />
                  <label className="flex flex-1 cursor-pointer items-center gap-2 select-none">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleVisible(c.key)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-700">{c.label}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => moveBy(c.key, -1)}
                    disabled={isFirst}
                    aria-label={`Move ${c.label} up`}
                    className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 sm:p-1"
                  >
                    <ArrowUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBy(c.key, 1)}
                    disabled={isLast}
                    aria-label={`Move ${c.label} down`}
                    className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 sm:p-1"
                  >
                    <ArrowDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
