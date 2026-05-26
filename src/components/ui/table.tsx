import { ChevronRight } from "lucide-react";
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
          // Each mobile card is a positioning context for the stretched card
          // link, with a right gutter that keeps content clear of the chevron.
          "[&_tbody_tr]:relative [&_tbody_tr]:pr-8 md:[&_tbody_tr]:static md:[&_tbody_tr]:pr-0",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

/**
 * Apply to the title cell's `<Link>` so the whole mobile card is tappable: the
 * `::before` pseudo-element covers the relative `<tr>`. Removed at `md+`, so the
 * desktop table is unaffected.
 *
 * Any other interactive descendant inside the same `<tr>` (e.g. a secondary
 * `<Link>` in another cell) needs `cardLinkRaise` so it sits above the
 * `::before` overlay on mobile — otherwise the row-tap eats the click and
 * routes the user to the title link.
 */
export const cardLink =
  "before:absolute before:inset-0 before:z-10 before:content-[''] md:before:content-none";

/** Add to a secondary interactive child inside a `cardLink` row to keep it
 *  clickable on mobile. Pairs with the `cardLink` overlay above. */
export const cardLinkRaise = "relative z-20";

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
  heading,
  secondary,
  className,
}: {
  children?: React.ReactNode;
  /** Column name shown beside the value when the table is collapsed on mobile. */
  label?: string;
  /** The card's title cell on mobile — rendered prominently with a tap chevron. */
  heading?: boolean;
  /** Non-essential cell — hidden on mobile, still shown in the desktop table. */
  secondary?: boolean;
  className?: string;
}) {
  if (heading) {
    return (
      <td
        className={cn(
          "block px-3 py-2 text-[15px] text-slate-700",
          "md:table-cell md:px-4 md:py-3 md:align-top md:text-sm",
          className,
        )}
      >
        {children}
        <ChevronRight
          aria-hidden
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 md:hidden"
        />
      </td>
    );
  }

  if (secondary) {
    return (
      <td
        className={cn(
          "hidden px-4 py-3 align-top text-slate-700 md:table-cell",
          className,
        )}
      >
        {children}
      </td>
    );
  }

  return (
    <td
      className={cn(
        "flex gap-3 px-3 py-1.5 text-slate-700 max-md:text-left md:table-cell md:px-4 md:py-3 md:align-top",
        className,
      )}
    >
      {label && (
        <span className="w-28 shrink-0 text-left text-xs font-medium uppercase tracking-wide text-slate-400 md:hidden">
          {label}
        </span>
      )}
      <span className="min-w-0 flex-1 md:contents">{children}</span>
    </td>
  );
}
