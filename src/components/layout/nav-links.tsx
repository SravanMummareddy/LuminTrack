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

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/vendor-portal", label: "Vendor Portal", icon: ClipboardList },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/submissions", label: "Submissions", icon: Send },
  { href: "/interviews", label: "Interviews", icon: CalendarClock },
  { href: "/bench", label: "Bench", icon: UsersRound },
  { href: "/placements", label: "Placements", icon: Handshake },
  { href: "/recruiters", label: "Recruiters", icon: UserRound },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
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
          </Link>
        );
      })}
    </>
  );
}
