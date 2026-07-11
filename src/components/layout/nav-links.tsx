"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  ClipboardList,
  Users,
  Send,
  CalendarClock,
  Handshake,
  UserRound,
  UsersRound,
  ChartColumn,
  Settings,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

type NavGroup = {
  /** Small uppercase heading above the group. Omitted for the lead + trailing groups. */
  label?: string;
  /** Render a divider above this group (used to set Settings apart at the bottom). */
  divider?: boolean;
  items: NavItem[];
};

// Grouped so the sidebar reads as a workflow: overview → requirements → people →
// pipeline → insights → settings. Order is meaningful; keep groups intact.
const NAV_GROUPS: NavGroup[] = [
  { items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    label: "Requirements",
    items: [
      { href: "/jobs", label: "Jobs", icon: Briefcase },
      { href: "/vendor-portal", label: "Vendor Portal Requirements", icon: ClipboardList },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/candidates", label: "Candidates", icon: Users },
      { href: "/bench", label: "Bench", icon: UsersRound },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/submissions", label: "Submissions", icon: Send },
      { href: "/interviews", label: "Interviews", icon: CalendarClock },
      { href: "/placements", label: "Placements", icon: Handshake },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/recruiters", label: "Recruiters", icon: UserRound },
      { href: "/reports", label: "Reports", icon: ChartColumn },
    ],
  },
  { divider: true, items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

// The restricted tier (recruiter + team lead) sees the operational surface only:
// the Insights group (Recruiters/Reports) and Settings are dropped, and the "/"
// home is relabelled from the analytics "Dashboard" to their personal "My Work"
// task view. Managers get the full NAV_GROUPS.
function navGroupsFor(isManager: boolean): NavGroup[] {
  if (isManager) return NAV_GROUPS;
  return NAV_GROUPS.filter((g) => g.label !== "Insights" && !g.divider).map((g) =>
    g.items[0]?.href === "/"
      ? { ...g, items: [{ ...g.items[0], label: "My Work" }] }
      : g,
  );
}

export function NavLinks({
  onNavigate,
  isManager,
}: {
  onNavigate?: () => void;
  isManager: boolean;
}) {
  const pathname = usePathname();
  const nodes: React.ReactNode[] = [];

  for (const group of navGroupsFor(isManager)) {
    if (group.divider) {
      nodes.push(
        <div
          key="nav-settings-divider"
          className="mx-2 border-t border-slate-200 pt-1"
          aria-hidden
        />,
      );
    }
    if (group.label) {
      nodes.push(
        <p
          key={`nav-label-${group.label}`}
          className="px-3 pb-0.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
        >
          {group.label}
        </p>,
      );
    }
    for (const { href, label, icon: Icon, exact } of group.items) {
      const active = exact
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);
      nodes.push(
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
            active
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>,
      );
    }
  }

  return <>{nodes}</>;
}
