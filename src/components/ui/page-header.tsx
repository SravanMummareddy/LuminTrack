import { Info } from "lucide-react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  /** Shown as a hover tooltip on an info icon beside the title — keeps the
   *  context without spending a whole subtitle line. */
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && (
          <span
            tabIndex={0}
            title={description}
            aria-label={description}
            className="inline-flex shrink-0 cursor-help text-slate-400 transition hover:text-slate-600"
          >
            <Info className="h-4 w-4" />
          </span>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
