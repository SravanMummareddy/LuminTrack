"use client";

import { useId, useMemo, useRef, useState } from "react";
import { controlClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export type ComboOption = { value: string; label: string };

type Props = {
  name: string;
  /** Controlled selected value (an option `value`, or the action value). */
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  id?: string;
  /** An always-visible action row pinned to the bottom (e.g. "+ Add new…"). */
  actionOption?: ComboOption;
  /** How many filtered options to render at once. */
  maxResults?: number;
};

/**
 * A searchable single-select: a text box that filters a long option list and a
 * custom-rendered dropdown (so colours/keyboard nav are consistent — unlike a
 * native `<select>`, which can't be filtered, or a native `<datalist>`, which
 * renders un-styleably). Submits the selected option's `value` via a hidden
 * input, so it drops into existing forms that read an id from `name`.
 *
 * Controlled: parent owns `value`. Selecting the optional `actionOption`
 * (e.g. "+ Add new client…") sets `value` to its sentinel so the parent can
 * reveal an inline input.
 */
export function SearchSelect({
  name,
  value,
  onChange,
  options,
  placeholder = "Select or type…",
  id,
  actionOption,
  maxResults = 50,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  const selectedLabel = useMemo(() => {
    if (actionOption && value === actionOption.value) return actionOption.label;
    return options.find((o) => o.value === value)?.label ?? "";
  }, [options, value, actionOption]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, maxResults);
    const starts: ComboOption[] = [];
    const contains: ComboOption[] = [];
    for (const o of options) {
      const low = o.label.toLowerCase();
      if (low.startsWith(q)) starts.push(o);
      else if (low.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, maxResults);
  }, [options, query, maxResults]);

  // Action row pinned at the bottom; it's the last navigable row.
  const rows: ComboOption[] = actionOption ? [...filtered, actionOption] : filtered;

  function choose(opt: ComboOption) {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0 && active < rows.length) {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={cn(controlClass, "pr-9")}
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      >
        ▾
      </span>
      {open && rows.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {rows.map((opt, i) => {
            const isAction = actionOption && opt.value === actionOption.value;
            return (
              <li
                key={opt.value || "__blank"}
                role="option"
                aria-selected={i === active}
                className={cn(
                  "cursor-pointer px-3 py-1.5",
                  isAction
                    ? "mt-1 border-t border-slate-100 font-medium text-indigo-600"
                    : "text-slate-900",
                  i === active && (isAction ? "bg-indigo-50" : "bg-slate-50"),
                  i !== active && !isAction && "hover:bg-slate-50",
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(opt)}
              >
                {opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
