"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

type Opt = { value: string; label: string; disabled: boolean };

/**
 * Drop-in replacement for the native `<select>` primitive: same `<option>`
 * children + `name`/`defaultValue`/`value`/`onChange` API, but rendered as a
 * custom listbox so the open menu matches the app (the native popup is
 * OS-drawn and un-styleable). Submits via a hidden input, so it keeps working
 * in the existing FormData/server-action forms. Supports both uncontrolled
 * (`defaultValue`) and controlled (`value` + `onChange`) usage, keyboard nav
 * (↑↓/Enter/Esc/Home/End + type-ahead), and click-outside close.
 */
export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  name,
  id,
  required,
  disabled,
  "aria-label": ariaLabel,
}: React.ComponentProps<"select">) {
  const options = useMemo<Opt[]>(
    () =>
      Children.toArray(children)
        .filter((c) => isValidElement(c) && c.type === "option")
        .map((c) => {
          const p = (c as React.ReactElement<React.ComponentProps<"option">>)
            .props;
          const label =
            typeof p.children === "string" || typeof p.children === "number"
              ? String(p.children)
              : String(p.value ?? "");
          return { value: String(p.value ?? ""), label, disabled: !!p.disabled };
        }),
    [children],
  );

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string>(
    () => (defaultValue as string | undefined) ?? "",
  );
  const selected = isControlled ? String(value) : internal;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const selectedOpt = options.find((o) => o.value === selected);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function commit(opt: Opt) {
    if (opt.disabled) return;
    if (!isControlled) setInternal(opt.value);
    // Match the native onChange contract call sites rely on (`e.target.value`).
    onChange?.({
      target: { value: opt.value, name },
    } as unknown as React.ChangeEvent<HTMLSelectElement>);
    // Updating the hidden input via React state fires no native event, so a
    // form-level `onInput` (the unsaved-changes dirty guard) wouldn't notice a
    // dropdown-only change → Cancel would navigate with no "discard?" prompt.
    // Emit a bubbling input event so it does (mirrors SearchSelect).
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    setOpen(false);
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === selected),
      ),
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => nextEnabled(options, i, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => nextEnabled(options, i, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(nextEnabled(options, -1, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(nextEnabled(options, options.length, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) commit(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key.length === 1) {
      // Type-ahead: jump to the next option whose label starts with the buffer.
      const now = Date.now();
      const t = typeahead.current;
      t.buffer = now - t.at > 800 ? e.key : t.buffer + e.key;
      t.at = now;
      const q = t.buffer.toLowerCase();
      const hit = options.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(q),
      );
      if (hit >= 0) setActive(hit);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input ref={hiddenRef} type="hidden" name={name} value={selected} required={required} />
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500",
          className,
        )}
      >
        <span className={cn("truncate", !selectedOpt && "text-slate-400")}>
          {selectedOpt?.label ?? "Select…"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && options.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={o.value || "__blank"}
              role="option"
              aria-selected={o.value === selected}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => !o.disabled && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(o)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5",
                o.disabled
                  ? "cursor-not-allowed text-slate-300"
                  : "cursor-pointer",
                !o.disabled &&
                  o.value === selected &&
                  "bg-indigo-50 font-medium text-indigo-900",
                !o.disabled && o.value !== selected && i === active && "bg-slate-50",
                !o.disabled && o.value !== selected && "text-slate-900",
              )}
            >
              <Check
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  o.value === selected ? "text-indigo-600" : "invisible",
                )}
              />
              <span className="truncate">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Step from index `from` in `dir` (±1), skipping disabled, clamping at ends. */
function nextEnabled(options: Opt[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
    if (!options[i].disabled) return i;
  }
  // No enabled option in that direction — keep the current one if valid.
  return from >= 0 && from < options.length ? from : options.findIndex((o) => !o.disabled);
}
