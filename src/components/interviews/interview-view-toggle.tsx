import Link from "next/link";
import { List, CalendarDays } from "lucide-react";

type SearchParams = Record<string, string | string[] | undefined>;
type View = "list" | "schedule";

// Preserve every active filter across the toggle; drop `page` (the schedule view
// isn't paged and the list should restart at page 1) and set `view` explicitly.
function buildHref(sp: SearchParams, view: View): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "view" || k === "page") continue;
    if (Array.isArray(v)) v.forEach((x) => x && params.append(k, x));
    else if (v) params.set(k, v);
  }
  if (view === "schedule") params.set("view", "schedule");
  const qs = params.toString();
  return qs ? `/interviews?${qs}` : "/interviews";
}

export function InterviewViewToggle({
  currentView,
  searchParams,
}: {
  currentView: View;
  searchParams: SearchParams;
}) {
  const item = (view: View, label: string, icon: React.ReactNode) => {
    const active = currentView === view;
    return (
      <Link
        href={buildHref(searchParams, view)}
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm transition ${
          active
            ? "bg-indigo-50 font-medium text-indigo-700"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <div className="inline-flex divide-x divide-slate-300 overflow-hidden rounded-md border border-slate-300">
      {item("list", "List", <List className="h-4 w-4" aria-hidden />)}
      {item("schedule", "Schedule", <CalendarDays className="h-4 w-4" aria-hidden />)}
    </div>
  );
}
