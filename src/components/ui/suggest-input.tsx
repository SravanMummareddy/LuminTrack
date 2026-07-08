"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/field";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** The list of suggestions to filter over (e.g. the candidate's skills, or a
   *  curated + learned lookup list). Anything unlisted still types through. */
  suggestions: string[];
  /** Fires when a value is "committed" — an option picked, Enter pressed, or the
   *  field blurred — carrying the final text. Use it to remember a new value
   *  (e.g. append a typed technology to the skills list). */
  onCommit?: (value: string) => void;
  maxResults?: number;
};

/**
 * A free-text input with a custom-rendered autocomplete over a caller-supplied
 * `suggestions` list. Generalizes `LocationInput` (same combobox behaviour,
 * keyboard nav, blur handling) so it can back Technology (over a candidate's
 * skills), Work authorization, "working now" type, etc. It stays a plain text
 * input — the list is only suggestions, so any unlisted value still types
 * through and submits with `name`.
 */
export function SuggestInput({
  value,
  defaultValue,
  onChange,
  onCommit,
  suggestions,
  name,
  className,
  maxResults = 8,
  ...props
}: Props) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const text = isControlled ? value! : internal;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of suggestions) {
      const low = s.toLowerCase();
      if (!q || low.startsWith(q)) starts.push(s);
      else if (low.includes(q)) contains.push(s);
      if (starts.length >= maxResults) break;
    }
    return [...starts, ...contains].slice(0, maxResults);
  }, [text, suggestions, maxResults]);

  function emit(next: string, real?: React.ChangeEvent<HTMLInputElement>) {
    if (!isControlled) setInternal(next);
    if (!onChange) return;
    if (real) {
      real.target.value = next;
      onChange(real);
    } else {
      onChange({
        target: { value: next, name: name ?? "" },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  }

  function select(s: string) {
    emit(s);
    onCommit?.(s);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      select(matches[active]);
    } else if (e.key === "Enter") {
      onCommit?.(text);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const showList = open && matches.length > 0;

  return (
    <div className="relative">
      <Input
        {...props}
        name={name}
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className={className}
        onChange={(e) => {
          emit(e.target.value, e);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            onCommit?.(text);
          }, 120);
        }}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              className={
                "cursor-pointer px-3 py-1.5 text-slate-900 " +
                (i === active ? "bg-indigo-50" : "hover:bg-slate-50")
              }
              onMouseEnter={() => setActive(i)}
              onClick={() => select(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
