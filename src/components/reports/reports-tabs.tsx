import Link from "next/link";

export type ReportsTab = "analytics" | "monthly";

/**
 * Underline tab strip on /reports. Analytics is the default (no `?tab=`), so its
 * own filter/pagination params stay canonical; Monthly Performance carries
 * `?tab=monthly`. Switching tabs drops the other tab's params (the two tabs have
 * disjoint param sets), which is the desired reset.
 */
export function ReportsTabs({ active }: { active: ReportsTab }) {
  const tabs: { key: ReportsTab; label: string; href: string }[] = [
    { key: "analytics", label: "Analytics", href: "/reports" },
    { key: "monthly", label: "Monthly Performance", href: "/reports?tab=monthly" },
  ];

  return (
    <nav className="border-b border-slate-200" aria-label="Reports view">
      <ul className="flex gap-1 -mb-px">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  "inline-block border-b-2 px-3 py-2 text-sm font-medium transition " +
                  (isActive
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700")
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
