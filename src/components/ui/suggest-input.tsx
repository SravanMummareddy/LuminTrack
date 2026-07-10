"use client";

import { Fragment, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/field";

/** A richer suggestion: an optional `group` (renders a header while browsing)
 *  and an optional `note` (a muted pill after the value, e.g. "no work auth"). */
export type SuggestOption = { value: string; group?: string; note?: string };

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** Plain suggestion list (e.g. the candidate's skills). Anything unlisted
   *  still types through. Provide this OR `options`. */
  suggestions?: string[];
  /** Grouped/annotated suggestions (e.g. the visa list). While the field is
   *  empty the options render grouped under their `group` headers; typing
   *  collapses to a flat relevance list. Still free-text (unlisted types through). */
  options?: SuggestOption[];
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
  options,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Unify the two inputs into one option list. Grouped rendering + notes only
  // apply when `options` is supplied.
  const grouped = options != null;
  const opts: SuggestOption[] = useMemo(
    () => options ?? (suggestions ?? []).map((s) => ({ value: s })),
    [options, suggestions],
  );

  const browsing = text.trim() === "";
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    // No query → keep source order (so groups read top-to-bottom); a query →
    // startsWith-first relevance and drop the grouping.
    if (!q) return opts.slice(0, maxResults);
    const starts: SuggestOption[] = [];
    const contains: SuggestOption[] = [];
    for (const o of opts) {
      const low = o.value.toLowerCase();
      if (low.startsWith(q)) starts.push(o);
      else if (low.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, maxResults);
  }, [text, opts, maxResults]);
  const showGroups = grouped && browsing && matches.some((m) => m.group);

  // Programmatically set the value the way a real keystroke would: drive it
  // through the native input setter and dispatch a bubbling `input` event. That
  // makes React's own onChange fire AND lets any ancestor `<form onInput>` (the
  // unsaved-changes guard) see the change. A plain synthetic onChange call would
  // skip the native event, so a mouse-picked suggestion never marked the form
  // dirty and its edit could be lost on soft navigation.
  function commit(next: string) {
    const el = inputRef.current;
    if (!el) {
      // No DOM node yet (SSR / tests) — fall back to a direct notify.
      if (!isControlled) setInternal(next);
      onChange?.({
        target: { value: next, name: name ?? "" },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      return;
    }
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function select(s: string) {
    commit(s);
    onCommit?.(s);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "ArrowDown") setOpen(true);
      // Enter on a free-typed value with no open list: commit (remember) it,
      // but suppress the form submit so the commit's state update (e.g. append
      // the new value to Skills) lands before any submit — otherwise the just-
      // typed value wouldn't be in the submitted FormData.
      else if (e.key === "Enter" && text.trim()) {
        e.preventDefault();
        onCommit?.(text);
      }
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
      select(matches[active].value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onCommit?.(text);
      setOpen(false);
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
        ref={inputRef}
        name={name}
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className={className}
        onChange={(e) => {
          if (!isControlled) setInternal(e.target.value);
          onChange?.(e);
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
          {matches.map((o, i) => {
            // A group header renders before the first option of each group
            // (browse state only). Headers are non-focusable — arrow-nav steps
            // through `matches` (options only), so the 1-D keyboard model holds.
            const header =
              showGroups &&
              o.group &&
              (i === 0 || matches[i - 1].group !== o.group) ? (
                <li
                  key={`h-${o.group}`}
                  role="presentation"
                  className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {o.group}
                </li>
              ) : null;
            return (
              <Fragment key={o.value}>
                {header}
                <li
                  role="option"
                  aria-selected={i === active}
                  className={
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-slate-900 " +
                    (i === active ? "bg-indigo-50" : "hover:bg-slate-50")
                  }
                  onMouseEnter={() => setActive(i)}
                  onClick={() => select(o.value)}
                >
                  <span>{o.value}</span>
                  {o.note && (
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {o.note}
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
