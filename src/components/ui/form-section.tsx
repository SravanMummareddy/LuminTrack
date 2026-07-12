/**
 * Numbered card section for the forms-discipline layout (Wave 3, from the Job
 * form #86). A tinted, rounded-top header with a small step badge over a padded
 * body. **Never add `overflow-hidden`** — it clips open dropdowns (see DEVLOG
 * 2026-07-12). Shared by the job / VPR / candidate / bench / submission forms.
 */
export function FormSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded bg-indigo-50 text-[11px] font-bold text-indigo-600">
          {n}
        </span>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
