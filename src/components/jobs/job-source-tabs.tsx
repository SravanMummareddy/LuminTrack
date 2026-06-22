import Link from "next/link";
import type { JobSource } from "@/server/queries/jobs";

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * Underline-style tab strip above the Jobs list. Acts as a view-mode switcher
 * between manually-entered jobs and imported requisitions.
 *
 * Switching tabs preserves every other filter/search/sort param except `page`
 * (which is reset because the row set changes). We strip the active source
 * value from the link's params so the resulting URL is canonical
 * (`?source=manual` rather than `?source=manual&source=manual`).
 */
export function JobSourceTabs({
  active,
  searchParams,
}: {
  active: JobSource | undefined;
  searchParams: SearchParams;
}) {
  const tabs: { key: JobSource | "all"; label: string }[] = [
    { key: "all", label: "All jobs" },
    { key: "manual", label: "Manual" },
    // "iLabor Requisitions" = the Randstad iLabor requisition jobs. (The
    // planning layer for those — the spreadsheet's "Vendor Portal Requirements"
    // tab — now lives at /vendor-portal.) Label only — the `randstad` key and
    // the portal-name filter are unchanged so URLs/imports keep working.
    { key: "randstad", label: "iLabor Requisitions" },
  ];

  function hrefFor(key: JobSource | "all"): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "source" || k === "page") continue;
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else if (typeof v === "string") params.set(k, v);
    }
    if (key !== "all") params.set("source", key);
    const qs = params.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  }

  return (
    <nav className="border-b border-slate-200" aria-label="Job source">
      <ul className="flex gap-1 -mb-px">
        {tabs.map((tab) => {
          const isActive =
            tab.key === "all" ? active === undefined : active === tab.key;
          return (
            <li key={tab.key}>
              <Link
                href={hrefFor(tab.key)}
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
