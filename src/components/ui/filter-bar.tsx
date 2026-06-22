"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronDown, X, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { DATE_PRESETS } from "@/lib/filters";

export type FilterOption = { value: string; label: string };

/**
 * A declarative filter definition. The shared {@link FilterBar} renders each as
 * a pill that opens a small popover; choosing a value navigates immediately
 * (auto-apply). `primary` filters always show as pills; the rest tuck behind a
 * "More" toggle until expanded (or until they're active, when they surface as a
 * pill so the active state is always visible).
 */
export type FilterDef =
  | {
      kind: "select";
      param: string;
      label: string;
      options: FilterOption[];
      /** Effective value when the param is absent (e.g. "ACTIVE"). Default "". */
      defaultValue?: string;
      /** Adds a search box to the popover (for long option lists). */
      searchable?: boolean;
      /** Multiple values, encoded as a comma-separated param. */
      multi?: boolean;
      primary?: boolean;
    }
  | {
      kind: "text";
      param: string;
      label: string;
      placeholder?: string;
      primary?: boolean;
    }
  | {
      kind: "number";
      param: string;
      label: string;
      placeholder?: string;
      /** Appended to the value in the pill / chip (e.g. "yrs"). */
      suffix?: string;
      primary?: boolean;
    }
  | {
      kind: "date";
      /** Pill label, e.g. "Date added". Uses preset/from/to params. */
      label: string;
      primary?: boolean;
    }
  | {
      kind: "toggle";
      param: string;
      label: string;
      primary?: boolean;
    };

export type SearchConfig = { param: string; placeholder?: string };

/** Cap for unsearched long lists — show the top N, then "type to narrow". */
const TOP_N = 8;

const pillBase =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition whitespace-nowrap";
const pillIdle = "border-slate-300 bg-white text-slate-600 hover:bg-slate-50";
const pillActive =
  "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100";
const popoverCls =
  "absolute left-0 top-full z-30 mt-1.5 min-w-52 rounded-lg border border-slate-200 bg-white p-1.5 text-sm shadow-lg";

function csv(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

export function FilterBar({
  basePath,
  search,
  filters,
}: {
  basePath: string;
  search?: SearchConfig;
  filters: FilterDef[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [term, setTerm] = useState("");

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpenKey(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function navigate(
    updates: Record<string, string | null>,
    opts?: { keepOpen?: boolean },
  ) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
    if (!opts?.keepOpen) setOpenKey(null);
  }

  const keyOf = (def: FilterDef, i: number) =>
    def.kind === "date" ? `date-${i}` : def.param;

  function isActive(def: FilterDef): boolean {
    if (def.kind === "date") {
      const p = params.get("preset");
      return Boolean(p && p !== "all");
    }
    if (def.kind === "select") {
      if (def.multi) return csv(params.get(def.param)).length > 0;
      const v = params.get(def.param) ?? def.defaultValue ?? "";
      return v !== (def.defaultValue ?? "");
    }
    return Boolean(params.get(def.param));
  }

  function valueLabel(def: FilterDef): string {
    if (def.kind === "date") {
      const p = params.get("preset");
      if (p === "custom") return "Custom";
      return DATE_PRESETS.find((d) => d.value === p)?.label ?? "";
    }
    if (def.kind === "select") {
      if (def.multi) {
        const vals = csv(params.get(def.param));
        if (vals.length === 1)
          return def.options.find((o) => o.value === vals[0])?.label ?? "1 selected";
        return `${vals.length} selected`;
      }
      const v = params.get(def.param) ?? def.defaultValue ?? "";
      return def.options.find((o) => o.value === v)?.label ?? "";
    }
    if (def.kind === "number")
      return `${params.get(def.param) ?? ""}${def.suffix ? ` ${def.suffix}` : ""}`;
    return params.get(def.param) ?? "";
  }

  function clear(def: FilterDef) {
    if (def.kind === "date") navigate({ preset: null, from: null, to: null });
    else navigate({ [def.param]: null });
  }

  const active = filters.map(isActive);
  const anyActive =
    active.some(Boolean) || Boolean(search && params.get(search.param));

  function renderPill(def: FilterDef, i: number) {
    const key = keyOf(def, i);
    const on = active[i];

    if (def.kind === "toggle") {
      return (
        <button
          key={key}
          type="button"
          onClick={() => navigate({ [def.param]: on ? null : "1" })}
          aria-pressed={on}
          className={cn(pillBase, on ? pillActive : pillIdle)}
        >
          {def.label}
          {on && <X className="h-3.5 w-3.5" />}
        </button>
      );
    }

    const isOpen = openKey === key;
    return (
      <div key={key} className="relative">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setOpenKey(isOpen ? null : key)}
          className={cn(pillBase, on ? pillActive : pillIdle)}
        >
          {on ? `${def.label}: ${valueLabel(def)}` : def.label}
          {on ? (
            <X
              className="h-3.5 w-3.5"
              role="button"
              aria-label={`Clear ${def.label}`}
              onClick={(e) => {
                e.stopPropagation();
                clear(def);
              }}
            />
          ) : (
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")}
            />
          )}
        </button>
        {isOpen && (
          <PopoverBody def={def} params={params} navigate={navigate} onClose={() => setOpenKey(null)} />
        )}
      </div>
    );
  }

  const searchChips = search ? csv(params.get(search.param)) : [];

  function addTerm() {
    if (!search) return;
    const t = term.trim();
    if (!t) return;
    const next = [...new Set([...searchChips, t])];
    navigate({ [search.param]: next.join(",") });
    setTerm("");
  }

  function removeTerm(t: string) {
    if (!search) return;
    navigate({ [search.param]: searchChips.filter((x) => x !== t).join(",") || null });
  }

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      {search && (
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={term}
            placeholder={search.placeholder ?? "Search…"}
            suppressHydrationWarning
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTerm();
              }
            }}
            className="w-full rounded-full border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      )}

      {searchChips.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => removeTerm(t)}
          className={cn(pillBase, pillActive)}
        >
          <Search className="h-3.5 w-3.5" />
          {t}
          <X className="h-3.5 w-3.5" />
        </button>
      ))}

      {filters.map((def, i) => renderPill(def, i))}

      {anyActive && (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="px-1.5 py-1 text-sm text-slate-400 hover:text-slate-600"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

type Navigate = (
  updates: Record<string, string | null>,
  opts?: { keepOpen?: boolean },
) => void;

function PopoverBody({
  def,
  params,
  navigate,
  onClose,
}: {
  def: Extract<FilterDef, { kind: "select" | "text" | "number" | "date" }>;
  params: URLSearchParams;
  navigate: Navigate;
  onClose: () => void;
}) {
  if (def.kind === "select")
    return <SelectPopover def={def} params={params} navigate={navigate} />;
  if (def.kind === "date") return <DatePopover params={params} navigate={navigate} />;
  return <TextPopover def={def} params={params} navigate={navigate} onClose={onClose} />;
}

function SelectPopover({
  def,
  params,
  navigate,
}: {
  def: Extract<FilterDef, { kind: "select" }>;
  params: URLSearchParams;
  navigate: Navigate;
}) {
  const [q, setQ] = useState("");
  const selected = useMemo(() => {
    if (def.multi) return new Set(csv(params.get(def.param)));
    return new Set([params.get(def.param) ?? def.defaultValue ?? ""]);
  }, [def, params]);

  // For multi, the empty "All …" option is meaningless (no selection = all).
  const base = def.multi ? def.options.filter((o) => o.value !== "") : def.options;

  const { rows, hidden } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) {
      return { rows: base.filter((o) => o.label.toLowerCase().includes(needle)), hidden: 0 };
    }
    if (def.searchable && base.length > TOP_N) {
      const sel = base.filter((o) => selected.has(o.value));
      const rest = base.filter((o) => !selected.has(o.value));
      const merged = [...sel, ...rest].slice(0, Math.max(TOP_N, sel.length));
      return { rows: merged, hidden: base.length - merged.length };
    }
    return { rows: base, hidden: 0 };
  }, [base, def.searchable, q, selected]);

  function pick(value: string) {
    if (def.multi) {
      const set = new Set(csv(params.get(def.param)));
      if (set.has(value)) set.delete(value);
      else set.add(value);
      navigate({ [def.param]: [...set].join(",") || null }, { keepOpen: true });
    } else {
      navigate({ [def.param]: value === (def.defaultValue ?? "") ? null : value });
    }
  }

  return (
    <div className={cn(popoverCls, "w-72")}>
      {def.searchable && (
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${def.label.toLowerCase()}…`}
          className="mb-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      )}
      <div className="max-h-64 overflow-auto">
        {rows.map((o) => {
          const sel = selected.has(o.value);
          return (
            <button
              key={o.value || "__all"}
              type="button"
              title={o.label}
              onClick={() => pick(o.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                sel ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50",
              )}
            >
              {def.multi ? (
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    sel ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300",
                  )}
                >
                  {sel && <Check className="h-3 w-3" />}
                </span>
              ) : sel ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
        {hidden > 0 && (
          <p className="px-2.5 pt-1 text-[11px] text-slate-400">
            +{hidden} more — type to narrow
          </p>
        )}
        {rows.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-slate-400">No matches.</p>
        )}
      </div>
      {def.multi && selected.size > 0 && (
        <button
          type="button"
          onClick={() => navigate({ [def.param]: null }, { keepOpen: true })}
          className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}

function DatePopover({
  params,
  navigate,
}: {
  params: URLSearchParams;
  navigate: Navigate;
}) {
  const current = params.get("preset") ?? "all";
  const [custom, setCustom] = useState(current === "custom");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  return (
    <div className={popoverCls}>
      {DATE_PRESETS.map((p) => {
        const sel = current === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              if (p.value === "custom") setCustom(true);
              else navigate({ preset: p.value === "all" ? null : p.value, from: null, to: null });
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
              sel ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50",
            )}
          >
            {sel ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
            {p.label}
          </button>
        );
      })}
      {custom && (
        <div className="mt-1 space-y-2 border-t border-slate-100 px-1 pt-2">
          <label className="block text-xs text-slate-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <label className="block text-xs text-slate-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <button
            type="button"
            disabled={!from && !to}
            onClick={() => navigate({ preset: "custom", from: from || null, to: to || null })}
            className="w-full rounded-md bg-indigo-600 px-2 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Apply dates
          </button>
        </div>
      )}
    </div>
  );
}

function TextPopover({
  def,
  params,
  navigate,
  onClose,
}: {
  def: Extract<FilterDef, { kind: "text" | "number" }>;
  params: URLSearchParams;
  navigate: Navigate;
  onClose: () => void;
}) {
  const [value, setValue] = useState(params.get(def.param) ?? "");
  const apply = () => navigate({ [def.param]: value.trim() || null });

  return (
    <div className={popoverCls}>
      <input
        autoFocus
        type={def.kind === "number" ? "number" : "text"}
        min={def.kind === "number" ? 0 : undefined}
        step={def.kind === "number" ? "0.1" : undefined}
        value={value}
        placeholder={def.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          } else if (e.key === "Escape") onClose();
        }}
        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      <button
        type="button"
        onClick={apply}
        className="mt-1.5 w-full rounded-md bg-indigo-600 px-2 py-1.5 text-sm font-medium text-white"
      >
        Apply
      </button>
    </div>
  );
}
