import { cn } from "@/lib/cn";

/**
 * Below `md` the table collapses into a stacked card list: the header row is
 * hidden and every `<Td>` shows its `label` inline. At `md+` it renders as a
 * normal table. Pages keep their existing `<thead>/<tbody>/<tr>` markup — the
 * responsive switch is driven entirely by descendant variants here.
 */
export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table
        className={cn(
          "block w-full text-sm md:table",
          "[&_thead]:hidden md:[&_thead]:table-header-group",
          "[&_tbody]:block md:[&_tbody]:table-row-group",
          "[&_tbody_tr]:block md:[&_tbody_tr]:table-row",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  label,
  className,
}: {
  children?: React.ReactNode;
  /** Column name shown beside the value when the table is collapsed on mobile. */
  label?: string;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "flex gap-3 px-3 py-1.5 text-slate-700 md:table-cell md:px-4 md:py-3 md:align-top",
        className,
      )}
    >
      {label && (
        <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400 md:hidden">
          {label}
        </span>
      )}
      <span className="min-w-0 flex-1 md:contents">{children}</span>
    </td>
  );
}
