"use client";

import { cn } from "@/lib/cn";

/** The small "N/A / Don't know / Not disclosed" chip toggle. */
export function NaToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition",
        checked
          ? "border-indigo-500 bg-indigo-50 text-indigo-600"
          : "border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400",
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cn(
          "grid h-3 w-3 place-items-center rounded-[3px] border",
          checked ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-400",
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
          </svg>
        )}
      </span>
      {label}
    </label>
  );
}

/**
 * Forms-discipline (Wave 3) field wrapper: "required, OR explicitly N/A". The
 * caller disables/clears its control when `na` is set; we render a hidden
 * `{name}__na="1"` so the server treats the field as a conscious "unknown"
 * (satisfies the requirement, stores null) rather than a silent blank.
 */
export function NullableField({
  label,
  htmlFor,
  name,
  naLabel = "N/A",
  na,
  onToggleNa,
  required = true,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  name: string;
  naLabel?: string;
  na: boolean;
  onToggleNa: (v: boolean) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <NaToggle label={naLabel} checked={na} onChange={onToggleNa} />
      </div>
      {children}
      {na && <input type="hidden" name={`${name}__na`} value="1" />}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
