"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/field";
import { LOCATION_SUGGESTIONS } from "@/lib/us-locations";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

const MAX_RESULTS = 8;

/**
 * A free-text location input with a custom-rendered autocomplete over the top
 * ~1,000 US cities ("City, ST") plus Remote/Hybrid/Onsite.
 *
 * We render our OWN dropdown rather than a native `<datalist>`: native datalist
 * popups are drawn by the browser's OS-level UI layer (un-styleable, and Chrome
 * on macOS intermittently renders the option text washed-out/white). A custom
 * combobox gives consistent colours, keyboard nav, and capped results. It stays
 * a plain text input — the list is only suggestions, so anything unlisted
 * ("Hyderabad", "Remote — EST") still types through.
 *
 * Works in both controlled (value + onChange) and uncontrolled (defaultValue)
 * modes, and keeps `name` so it submits with native form posts.
 */
export function LocationInput({
  value,
  defaultValue,
  onChange,
  name,
  className,
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

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const loc of LOCATION_SUGGESTIONS) {
      const low = loc.toLowerCase();
      if (low.startsWith(q)) starts.push(loc);
      else if (low.includes(q)) contains.push(loc);
      if (starts.length >= MAX_RESULTS) break;
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [text]);

  // Set the value the way a real keystroke would: drive it through the native
  // input setter and dispatch a bubbling `input` event. That fires React's own
  // onChange AND lets any ancestor `<form onInput>` (the unsaved-changes guard)
  // see the change. A plain synthetic onChange call would skip the native event,
  // so a mouse-picked suggestion never marked the form dirty and its edit could
  // be lost on soft navigation. Mirrors `SuggestInput.commit()`.
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

  function select(loc: string) {
    commit(loc);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "ArrowDown" && matches.length > 0) setOpen(true);
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
          // delay so an option's onClick fires before we close
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          onMouseDown={(e) => {
            // keep focus on the input so blur-close doesn't beat the click
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((loc, i) => (
            <li
              key={loc}
              role="option"
              aria-selected={i === active}
              className={
                "cursor-pointer px-3 py-1.5 text-slate-900 " +
                (i === active ? "bg-indigo-50" : "hover:bg-slate-50")
              }
              onMouseEnter={() => setActive(i)}
              onClick={() => select(loc)}
            >
              {loc}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
