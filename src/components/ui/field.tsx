import { cn } from "@/lib/cn";

/** Shared styling for text inputs, textareas, and selects. */
export const controlClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500";

export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

// suppressHydrationWarning on form controls: password-manager extensions
// (NordPass, LastPass, 1Password, Norton) inject `data-np-*` / `data-lastpass-*`
// attributes onto inputs before React hydrates, which would otherwise log a
// mismatch warning on every page with a form.
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(controlClass, className)}
      suppressHydrationWarning
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlClass, className)}
      suppressHydrationWarning
      {...props}
    />
  );
}

// The styled custom dropdown (client component) replaces the native <select>
// while keeping the same <option>-children + name/value API. Re-exported here
// so the ~18 call sites keep importing `Select` from this module unchanged.
export { Select } from "./select-menu";
