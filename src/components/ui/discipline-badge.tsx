import { cn } from "@/lib/cn";
import { DISCIPLINE_LABEL } from "@/lib/labels";
import type { Discipline } from "@/generated/prisma/enums";

/**
 * Refined discipline chip (IT / Non-IT). A soft-tinted fill + hairline inset
 * ring in the hue — lighter and crisper than the flat pastel status `Badge`,
 * and compact enough not to pad the table row. Renders a muted "—" when unset.
 * Shared across the candidates, bench, and jobs tables so they stay consistent.
 */
const toneClass: Record<Discipline, string> = {
  IT: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  NON_IT: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function DisciplineBadge({
  discipline,
}: {
  discipline: Discipline | null | undefined;
}) {
  if (!discipline) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset",
        toneClass[discipline],
      )}
    >
      {DISCIPLINE_LABEL[discipline]}
    </span>
  );
}
